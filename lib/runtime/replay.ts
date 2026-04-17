/**
 * Replay engine — re-execute a run with its exact original config.
 *
 * Modes:
 *   - "live": re-executes LLM calls against the real provider
 *   - "stub": replays ALL original traces (LLM + tool + custom) with zero cost
 *
 * Freezes: agent_version, model_profile, prompt_artifact, workflow_version.
 * Links: replay_of_run_id, workflow_version_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import type { ChatMessage } from "../llm/types";
import type { TraceKind } from "../domain/types";
import { getProvider } from "../llm/router";
import { RunTracer, type ReplayMode } from "./tracer";
import { RuntimeError } from "./lifecycle";

type DB = SupabaseClient<Database>;

export interface ReplayOptions {
  run_id: string;
  mode?: ReplayMode;
  override_input?: Record<string, unknown>;
  cost_budget_usd?: number;
}

export interface StubTraceResult {
  original_name: string;
  original_kind: string;
  replay_trace_id: string | null;
  stubbed: boolean;
  fallback_used: boolean;
}

export interface ReplayResult {
  replay_run_id: string;
  original_run_id: string;
  replay_mode: ReplayMode;
  status: "completed" | "failed";
  output: unknown;
  comparison: {
    original_output: unknown;
    original_tokens_in: number;
    original_tokens_out: number;
    original_cost_usd: number;
    original_latency_ms: number | null;
    replay_tokens_in: number;
    replay_tokens_out: number;
    replay_cost_usd: number;
    replay_latency_ms: number;
  };
  stubs_used: number;
  stub_details: StubTraceResult[];
  error?: string;
}

interface OriginalTrace {
  id: string;
  kind: string;
  name: string;
  step_index: number;
  input: unknown;
  output: unknown;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  model_used: string | null;
  status: string;
}

export async function replayRun(
  sb: DB,
  opts: ReplayOptions,
): Promise<ReplayResult> {
  const mode = opts.mode ?? "live";

  const { data: originalRun } = await sb
    .from("runs")
    .select("*")
    .eq("id", opts.run_id)
    .single();

  if (!originalRun) {
    throw new RuntimeError("REPLAY_SOURCE_NOT_FOUND", `Run ${opts.run_id} not found`);
  }

  if (originalRun.status !== "completed" && originalRun.status !== "failed") {
    throw new RuntimeError(
      "INVALID_INPUT",
      `Cannot replay run in status '${originalRun.status}' — only completed/failed runs`,
    );
  }

  let originalTraces: OriginalTrace[] = [];
  if (mode === "stub") {
    const { data: traces } = await sb
      .from("traces")
      .select("id, kind, name, step_index, input, output, tokens_in, tokens_out, cost_usd, model_used, status")
      .eq("run_id", opts.run_id)
      .order("started_at", { ascending: true });
    originalTraces = (traces ?? []) as unknown as OriginalTrace[];

    if (originalTraces.length === 0) {
      throw new RuntimeError(
        "INVALID_INPUT",
        "Cannot stub replay — no traces found on original run",
      );
    }
  }

  const input = opts.override_input ?? (originalRun.input as Record<string, unknown>);

  let systemPrompt: string | null = null;
  let agentModelProvider: string | null = null;
  let agentModelName: string | null = null;
  let temperature = 0.7;
  let maxTokens = 4096;
  let topP = 1.0;

  if (originalRun.agent_version_id) {
    const { data: version } = await sb
      .from("agent_versions")
      .select("system_prompt, config_snapshot, model_profile_id")
      .eq("id", originalRun.agent_version_id)
      .single();

    if (version) {
      systemPrompt = version.system_prompt;
      const snapshot = version.config_snapshot as Record<string, unknown> | null;
      if (snapshot) {
        agentModelProvider = (snapshot.model_provider as string) ?? null;
        agentModelName = (snapshot.model_name as string) ?? null;
        temperature = (snapshot.temperature as number) ?? 0.7;
        maxTokens = (snapshot.max_tokens as number) ?? 4096;
        topP = (snapshot.top_p as number) ?? 1.0;
      }
    }
  }

  if (!systemPrompt && originalRun.agent_id) {
    const { data: agent } = await sb
      .from("agents")
      .select("system_prompt, model_provider, model_name, temperature, max_tokens, top_p")
      .eq("id", originalRun.agent_id)
      .single();

    if (agent) {
      systemPrompt = agent.system_prompt;
      agentModelProvider = agent.model_provider;
      agentModelName = agent.model_name;
      temperature = agent.temperature;
      maxTokens = agent.max_tokens;
      topP = agent.top_p;
    }
  }

  if (originalRun.prompt_artifact_id) {
    const { data: artifact } = await sb
      .from("prompt_artifacts")
      .select("content")
      .eq("id", originalRun.prompt_artifact_id)
      .single();

    if (artifact) {
      systemPrompt = artifact.content;
    }
  }

  if (mode === "live" && (!agentModelProvider || !agentModelName)) {
    throw new RuntimeError("PROVIDER_UNAVAILABLE", "Cannot determine model for live replay");
  }

  const tracer = new RunTracer(sb);
  const replayRunId = await tracer.startRun({
    kind: originalRun.kind as "chat" | "workflow" | "evaluation" | "tool_test",
    trigger: "replay",
    agent_id: originalRun.agent_id ?? undefined,
    agent_version_id: originalRun.agent_version_id ?? undefined,
    workflow_version_id: originalRun.workflow_version_id ?? undefined,
    model_profile_id: originalRun.model_profile_id ?? undefined,
    prompt_artifact_id: originalRun.prompt_artifact_id ?? undefined,
    input,
    replay_of_run_id: opts.run_id,
    replay_mode: mode,
    cost_budget_usd: opts.cost_budget_usd,
  });

  let stubsUsed = 0;
  const stubDetails: StubTraceResult[] = [];

  try {
    let finalOutput: Record<string, unknown> = {};

    if (mode === "stub") {
      finalOutput = await replayStubMultiStep(sb, tracer, originalTraces, opts.run_id, stubDetails);
      stubsUsed = stubDetails.filter((d) => d.stubbed).length;
    } else {
      finalOutput = await replayLive(
        tracer, opts.run_id, input, systemPrompt,
        agentModelProvider!, agentModelName!, temperature, maxTokens, topP,
      );
    }

    const totals = tracer.getTotals();
    await tracer.endRun("completed", finalOutput);

    return buildResult(
      replayRunId, opts.run_id, mode, "completed", finalOutput,
      originalRun, totals, stubsUsed, stubDetails,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await tracer.endRun("failed", {}, msg);
    const totals = tracer.getTotals();
    return buildResult(
      replayRunId, opts.run_id, mode, "failed", null,
      originalRun, totals, stubsUsed, stubDetails, msg,
    );
  }
}

async function replayStubMultiStep(
  sb: DB,
  tracer: RunTracer,
  originalTraces: OriginalTrace[],
  originalRunId: string,
  stubDetails: StubTraceResult[],
): Promise<Record<string, unknown>> {
  let lastOutput: Record<string, unknown> = {};

  for (const ot of originalTraces) {
    if (ot.status === "skipped") {
      stubDetails.push({
        original_name: ot.name,
        original_kind: ot.kind,
        replay_trace_id: null,
        stubbed: false,
        fallback_used: false,
      });
      continue;
    }

    const stubOutput = (ot.output as Record<string, unknown>) ?? {};
    const isFallback = Object.keys(stubOutput).length === 0;

    const fallbackOutput = isFallback
      ? { _stub_fallback: true, _original_trace_id: ot.id, _reason: "empty original output" }
      : stubOutput;

    const traceKind = isValidTraceKind(ot.kind) ? ot.kind : "custom";

    const stubResult = await tracer.trace({
      kind: traceKind,
      step_index: ot.step_index,
      name: `stub:${ot.name}`,
      input: { original_run_id: originalRunId, original_trace_id: ot.id, replay_mode: "stub" },
      fn: async () => ({
        output: fallbackOutput as Record<string, Json>,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        model_used: ot.model_used ?? undefined,
      }),
    });

    if (stubResult.trace_id) {
      await sb.from("traces").update({ output_trust: "stubbed" }).eq("id", stubResult.trace_id);
    }

    lastOutput = stubResult.output;

    stubDetails.push({
      original_name: ot.name,
      original_kind: ot.kind,
      replay_trace_id: stubResult.trace_id,
      stubbed: true,
      fallback_used: isFallback,
    });
  }

  return lastOutput;
}

async function replayLive(
  tracer: RunTracer,
  originalRunId: string,
  input: Record<string, unknown>,
  systemPrompt: string | null,
  provider: string,
  model: string,
  temperature: number,
  maxTokens: number,
  topP: number,
): Promise<Record<string, unknown>> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt ?? "" },
    { role: "user", content: typeof input.message === "string" ? input.message : JSON.stringify(input) },
  ];

  const llmProvider = getProvider(provider);

  const liveResult = await tracer.trace({
    kind: "llm_call",
    name: `replay:${provider}/${model}`,
    input: { original_run_id: originalRunId, replay_mode: "live" },
    fn: async () => {
      const res = await llmProvider.chat({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
      });
      return {
        output: { content: res.content } as Record<string, Json>,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        cost_usd: res.cost_usd,
        model_used: `${provider}/${model}`,
      };
    },
  });

  return liveResult.output;
}

const VALID_TRACE_KINDS = new Set<string>([
  "llm_call", "tool_call", "memory_read", "memory_write",
  "skill_invoke", "condition_eval", "error", "guard", "custom",
]);

function isValidTraceKind(kind: string): kind is TraceKind {
  return VALID_TRACE_KINDS.has(kind);
}

function buildResult(
  replayRunId: string,
  originalRunId: string,
  mode: ReplayMode,
  status: "completed" | "failed",
  output: unknown,
  originalRun: { output: unknown; tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number | null },
  totals: { tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number },
  stubsUsed: number,
  stubDetails: StubTraceResult[],
  error?: string,
): ReplayResult {
  return {
    replay_run_id: replayRunId,
    original_run_id: originalRunId,
    replay_mode: mode,
    status,
    output,
    comparison: {
      original_output: originalRun.output,
      original_tokens_in: originalRun.tokens_in,
      original_tokens_out: originalRun.tokens_out,
      original_cost_usd: originalRun.cost_usd,
      original_latency_ms: originalRun.latency_ms,
      replay_tokens_in: totals.tokens_in,
      replay_tokens_out: totals.tokens_out,
      replay_cost_usd: totals.cost_usd,
      replay_latency_ms: totals.latency_ms,
    },
    stubs_used: stubsUsed,
    stub_details: stubDetails,
    error,
  };
}

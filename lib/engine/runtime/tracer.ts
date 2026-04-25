import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import type { RunKind, TraceKind } from "../../domain/types";
import {
  type RunStatus,
  type TraceStatus,
  type RunTrigger,
  type RunEvent,
  type RunEventKind,
  assertRunTransition,
  RuntimeError,
  withTimeout,
  DEFAULT_TIMEOUTS,
} from "./lifecycle";
import { enforceCostBudget, type CostBudget, DEFAULT_COST_BUDGET } from "./cost-sentinel";
import { validateOutput, type OutputValidationResult } from "./output-validator";
import type { AgentGuardPolicy } from "./prompt-guard";

type DB = SupabaseClient<Database>;
type JsonRecord = Record<string, Json | undefined>;

export type ReplayMode = "live" | "stub";

export interface StartRunOptions {
  kind: RunKind;
  trigger?: RunTrigger;
  agent_id?: string;
  agent_version_id?: string;
  workflow_id?: string;
  workflow_version_id?: string;
  conversation_id?: string;
  model_profile_id?: string;
  prompt_artifact_id?: string;
  input: Record<string, unknown>;
  parent_run_id?: string;
  replay_of_run_id?: string;
  timeout_ms?: number;
  max_retries?: number;
  cost_budget_usd?: number;
  replay_mode?: ReplayMode;
  guard_policy?: AgentGuardPolicy;
}

export interface TraceOptions {
  kind: TraceKind;
  step_index?: number;
  name: string;
  input?: Record<string, unknown>;
  timeout_ms?: number;
  fn: () => Promise<{
    output: Record<string, unknown>;
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
    model_used?: string;
  }>;
}

export interface TraceResult {
  output: Record<string, unknown>;
  trace_id: string | null;
  status: TraceStatus;
  latency_ms: number;
  validation?: OutputValidationResult;
}

export class RunTracer {
  private runId: string | null = null;
  private runStatus: RunStatus = "pending";
  private sb: DB;
  private startTime: number;
  private totalTokensIn = 0;
  private totalTokensOut = 0;
  private totalCost = 0;
  private events: RunEvent[] = [];
  private costBudget: CostBudget = DEFAULT_COST_BUDGET;
  private replayMode: ReplayMode = "live";
  private guardPolicy: AgentGuardPolicy | undefined;

  constructor(sb: DB) {
    this.sb = sb;
    this.startTime = Date.now();
  }

  async startRun(opts: StartRunOptions): Promise<string> {
    this.replayMode = opts.replay_mode ?? "live";
    this.guardPolicy = opts.guard_policy;
    if (opts.cost_budget_usd !== undefined) {
      this.costBudget = { budget_usd: opts.cost_budget_usd, warning_threshold: 0.8 };
    }

    const { data } = await this.sb
      .from("runs")
      .insert({
        kind: opts.kind,
        status: "running" as const,
        trigger: opts.trigger ?? "api",
        agent_id: opts.agent_id ?? null,
        agent_version_id: opts.agent_version_id ?? null,
        workflow_id: opts.workflow_id ?? null,
        workflow_version_id: opts.workflow_version_id ?? null,
        conversation_id: opts.conversation_id ?? null,
        model_profile_id: opts.model_profile_id ?? null,
        prompt_artifact_id: opts.prompt_artifact_id ?? null,
        input: opts.input as JsonRecord,
        parent_run_id: opts.parent_run_id ?? null,
        replay_of_run_id: opts.replay_of_run_id ?? null,
        timeout_ms: opts.timeout_ms ?? DEFAULT_TIMEOUTS.run_timeout_ms,
        max_retries: opts.max_retries ?? 0,
        cost_budget_usd: opts.cost_budget_usd ?? null,
        replay_mode: this.replayMode,
        started_at: new Date(this.startTime).toISOString(),
      })
      .select("id")
      .single();

    this.runId = data?.id ?? null;
    this.runStatus = "running";
    this.emitEvent("run:started", {});
    return this.runId!;
  }

  async trace(opts: TraceOptions): Promise<TraceResult> {
    if (!this.runId) throw new RuntimeError("RUN_NOT_STARTED", "Run not started");
    if (this.isTerminal()) throw new RuntimeError("RUN_ALREADY_FINISHED", `Run is ${this.runStatus}`);

    const traceStart = Date.now();
    const timeout = opts.timeout_ms ?? DEFAULT_TIMEOUTS.step_timeout_ms;
    let result: Awaited<ReturnType<typeof opts.fn>>;
    let error: string | undefined;
    let traceStatus: TraceStatus = "completed";

    try {
      result = await withTimeout(opts.fn(), timeout, `trace:${opts.name}`);
    } catch (e) {
      if (e instanceof RuntimeError && e.code === "TIMEOUT") {
        traceStatus = "timeout";
        error = e.message;
      } else {
        traceStatus = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
      result = { output: { error } };
    }

    const latency = Date.now() - traceStart;
    const tokensIn = result.tokens_in ?? 0;
    const tokensOut = result.tokens_out ?? 0;
    const cost = result.cost_usd ?? 0;

    this.totalTokensIn += tokensIn;
    this.totalTokensOut += tokensOut;
    this.totalCost += cost;

    const { data } = await this.sb
      .from("traces")
      .insert({
        run_id: this.runId,
        kind: opts.kind,
        status: traceStatus,
        step_index: opts.step_index ?? 0,
        name: opts.name,
        input: (opts.input ?? {}) as JsonRecord,
        output: result.output as JsonRecord,
        error: error ?? null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        latency_ms: latency,
        model_used: result.model_used ?? null,
        started_at: new Date(traceStart).toISOString(),
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const traceId = data?.id ?? null;

    if (traceStatus === "failed") {
      this.emitEvent("trace:failed", { trace_id: traceId, error, name: opts.name });
    } else if (traceStatus === "timeout") {
      this.emitEvent("trace:timeout", { trace_id: traceId, timeout, name: opts.name });
    } else {
      this.emitEvent("trace:completed", { trace_id: traceId, latency, name: opts.name });
    }

    if (error && traceStatus !== "timeout") throw new Error(error);
    if (traceStatus === "timeout") throw new RuntimeError("TIMEOUT", error!, false);

    enforceCostBudget(this.totalCost, this.costBudget, this.emitEvent.bind(this));

    // Output validation for LLM traces
    let validation: OutputValidationResult | undefined;
    if (opts.kind === "llm_call" && traceStatus === "completed" && traceId) {
      const outputText = extractOutputText(result.output);
      validation = validateOutput(outputText, {
        is_stub: this.replayMode === "stub",
        has_tool_backing: false,
        policy: this.guardPolicy,
      });

      await this.sb
        .from("traces")
        .update({ output_trust: validation.trust })
        .eq("id", traceId);
    }

    return { output: result.output, trace_id: traceId, status: traceStatus, latency_ms: latency, validation };
  }

  async endRun(
    status: "completed" | "failed" | "cancelled" | "timeout",
    output: Record<string, unknown> = {},
    error?: string,
  ) {
    if (!this.runId) return;
    assertRunTransition(this.runStatus, status);
    this.runStatus = status;

    await this.sb
      .from("runs")
      .update({
        status,
        output: output as JsonRecord,
        error: error ?? null,
        tokens_in: this.totalTokensIn,
        tokens_out: this.totalTokensOut,
        cost_usd: this.totalCost,
        latency_ms: Date.now() - this.startTime,
        finished_at: new Date().toISOString(),
      })
      .eq("id", this.runId);

    const eventKind: RunEventKind =
      status === "completed" ? "run:completed" :
      status === "failed" ? "run:failed" :
      status === "timeout" ? "run:timeout" :
      "run:cancelled";

    this.emitEvent(eventKind, { output, error });
  }

  getRunId(): string | null {
    return this.runId;
  }

  getStatus(): RunStatus {
    return this.runStatus;
  }

  getEvents(): RunEvent[] {
    return [...this.events];
  }

  getTotals() {
    return {
      tokens_in: this.totalTokensIn,
      tokens_out: this.totalTokensOut,
      cost_usd: this.totalCost,
      latency_ms: Date.now() - this.startTime,
    };
  }

  getReplayMode(): ReplayMode {
    return this.replayMode;
  }

  getCostBudget(): CostBudget {
    return this.costBudget;
  }

  private isTerminal(): boolean {
    return ["completed", "failed", "cancelled", "timeout"].includes(this.runStatus);
  }

  private emitEvent(kind: RunEventKind, data: Record<string, unknown>) {
    this.events.push({
      kind,
      run_id: this.runId ?? "unknown",
      timestamp: new Date().toISOString(),
      data,
    });
  }
}

function extractOutputText(output: Record<string, unknown>): string {
  if (typeof output.content === "string") return output.content;
  if (typeof output.text === "string") return output.text;
  if (typeof output.result === "string") return output.result;
  return JSON.stringify(output);
}

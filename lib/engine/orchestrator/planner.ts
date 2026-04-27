/**
 * Orchestrator Planner — Transforms user intent into a structured Plan.
 *
 * Uses Claude tool-calling to produce either:
 * - A Plan with steps (complex tasks)
 * - A direct text response (simple tasks)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan, PlanStep } from "@/lib/engine/runtime/plans/types";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import { PlanStore } from "@/lib/engine/runtime/plans/store";
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_MODEL,
  PLAN_TOOL,
  RESPOND_TOOL,
  REQUEST_CONNECTION_TOOL,
} from "./system-prompt";
import { isAgentValidForDomain, getValidAgentsForDomain, type Domain } from "@/lib/capabilities/taxonomy";

export type PlanningResult =
  | { kind: "plan"; plan: Plan }
  | { kind: "direct_response"; text: string }
  | { kind: "request_connection"; app: string; reason: string }
  | { kind: "error"; error: string };

interface PlanStepFromLLM {
  intent: string;
  agent: string;
  task_description: string;
  expected_output: string;
  retrieval_mode?: string;
  needs_artifact?: boolean;
  optional?: boolean;
  depends_on?: number[];
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlanFromIntentOptions {
  surface?: string;
  capabilityDomain?: string;
  /**
   * Per-user Composio action slugs (e.g. "GMAIL_SEND_EMAIL", "SLACKBOT_…").
   * When present, the planner gets an extra system block listing the
   * user's actually-available actions plus the draft-first write rule.
   * The static prompt stays cached; this dynamic suffix is sent uncached
   * (small relative cost, full per-user awareness).
   */
  discoveredActions?: string[];
}

export async function planFromIntent(
  db: SupabaseClient,
  engine: RunEngine,
  userMessage: string,
  conversationHistory: ConversationMessage[],
  surfaceOrOptions?: string | PlanFromIntentOptions,
  capabilityDomainArg?: string,
): Promise<PlanningResult> {
  // Backward compatibility: accept (..., surface, capabilityDomain) OR
  // (..., options). Internal callers should migrate to the options form.
  const opts: PlanFromIntentOptions =
    typeof surfaceOrOptions === "object" && surfaceOrOptions !== null
      ? surfaceOrOptions
      : { surface: surfaceOrOptions, capabilityDomain: capabilityDomainArg };

  const { surface, capabilityDomain, discoveredActions } = opts;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user" as const,
      content: buildUserPrompt(userMessage, surface),
    },
  ];

  // ── Prompt caching ─────────────────────────────────────────
  // The static system prompt (~1500 tokens) and tool definitions (~500
  // tokens) are identical across every planning call → cached with
  // `ephemeral` (5-min TTL). The dynamic per-user block (Composio actions +
  // draft-first rule) is appended as a SECOND system content block with no
  // cache_control: it differs per user but is small (~300-1500 tokens), so
  // we trade a tiny per-turn cost for full per-user awareness while the
  // huge static prefix still hits cache.
  const systemBlocks: Anthropic.MessageCreateParams["system"] = [
    {
      type: "text",
      text: ORCHESTRATOR_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  const dynamicSuffix = buildDynamicSystemSuffix(discoveredActions ?? []);
  if (dynamicSuffix) {
    (systemBlocks as Anthropic.TextBlockParam[]).push({
      type: "text",
      text: dynamicSuffix,
    });
  }
  const cachedSystem = systemBlocks;

  // Cache_control on the last tool caches the entire tools array.
  const cachedTools = [
    PLAN_TOOL,
    RESPOND_TOOL,
    { ...REQUEST_CONNECTION_TOOL, cache_control: { type: "ephemeral" } },
  ] as unknown as Anthropic.Tool[];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: ORCHESTRATOR_MODEL,
      max_tokens: 4096,
      system: cachedSystem,
      messages,
      tools: cachedTools,
      tool_choice: { type: "any" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("[Orchestrator/Planner] LLM error:", msg);
    return { kind: "error", error: msg };
  }

  await engine.cost.track({
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    tool_calls: 0,
    latency_ms: 0,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { kind: "direct_response", text: text || "OK" };
  }

  // ── Inline app connect request ────────────────────────────
  if (toolUse.name === "request_connection") {
    const input = toolUse.input as { app: string; reason: string };
    return {
      kind: "request_connection",
      app: input.app.toLowerCase(),
      reason: input.reason,
    };
  }

  // ── Direct response ──────────────────────────────────────
  if (toolUse.name === "text_response") {
    const input = toolUse.input as { text: string };
    return { kind: "direct_response", text: input.text };
  }

  // ── Plan creation ────────────────────────────────────────
  if (toolUse.name === "create_plan") {
    const input = toolUse.input as {
      reasoning: string;
      steps: PlanStepFromLLM[];
    };

    if (!input.steps || input.steps.length === 0) {
      return {
        kind: "direct_response",
        text: input.reasoning || "Tâche comprise, aucune action nécessaire.",
      };
    }

    const planSteps: Omit<
      PlanStep,
      "id" | "plan_id" | "status" | "run_step_id" | "completed_at"
    >[] = input.steps.map((s, i) => {
      let agent = s.agent;

      if (capabilityDomain && !isAgentValidForDomain(agent, capabilityDomain as Domain)) {
        const validAgents = getValidAgentsForDomain(capabilityDomain as Domain);
        const fallback = validAgents[0] ?? "KnowledgeRetriever";
        console.warn(`[Planner] Agent "${agent}" invalid for domain "${capabilityDomain}" — remapped to "${fallback}"`);
        agent = fallback;
      }

      return {
        order: i + 1,
        intent: s.intent,
        agent,
        task_description: s.task_description,
        expected_output: s.expected_output,
        retrieval_mode: s.retrieval_mode,
        depends_on: (s.depends_on ?? []).map(String),
        optional: s.optional ?? false,
      };
    });

    const store = new PlanStore(db);
    const plan = await store.createPlan(
      engine.id,
      input.reasoning,
      planSteps,
    );

    await engine.attachPlanId(plan.id, plan.steps.length);

    return { kind: "plan", plan };
  }

  return { kind: "error", error: `Unknown tool: ${toolUse.name}` };
}

function buildUserPrompt(message: string, surface?: string): string {
  let prompt = message;
  if (surface) {
    prompt = `[Surface active: ${surface}]\n\n${message}`;
  }
  return prompt;
}

/**
 * Per-turn system suffix listing the actions the *current user* has connected
 * via Composio, plus the draft-first safety rule for any write op.
 *
 * Why this is a SEPARATE system block (not merged into ORCHESTRATOR_SYSTEM_PROMPT):
 * - The static prompt is cached (`ephemeral` 5-min TTL). Inlining per-user
 *   data would invalidate the cache on every user switch.
 * - Splitting keeps the cached prefix big and stable while the dynamic
 *   suffix stays small (truncated to 80 names + a regex-based safety rule).
 *
 * Returns null when there are no discovered actions (skip the empty block).
 */
function buildDynamicSystemSuffix(discoveredActions: string[]): string | null {
  const WRITE_PATTERN = /(SEND|CREATE|UPDATE|DELETE|POST|REPLY|FORWARD|REVOKE|REFUND)/i;
  const writeActions = discoveredActions.filter((a) => WRITE_PATTERN.test(a));

  const parts: string[] = [];

  // ── Connected actions overview ──────────────────────────────
  if (discoveredActions.length > 0) {
    const previewLimit = 80;
    const preview = discoveredActions.slice(0, previewLimit);
    const overflow =
      discoveredActions.length > previewLimit
        ? ` (+${discoveredActions.length - previewLimit} more not listed)`
        : "";
    parts.push(
      `🔌 USER-CONNECTED ACTIONS (Composio, ${discoveredActions.length} total${overflow})`,
    );
    parts.push(
      `These are real API actions exposed by the apps THIS user has connected. Use them when planning steps that need a third-party effect:\n${preview.join(", ")}`,
    );
  } else {
    parts.push(
      `🔌 USER-CONNECTED ACTIONS: none yet. The user has not connected any third-party app via Composio.`,
    );
  }

  // ── Inline-connect tool guidance ────────────────────────────
  // Derive the set of "app prefixes" the user has connected so we can
  // tell the LLM unambiguously which apps trigger request_connection.
  const connectedAppPrefixes = new Set(
    discoveredActions.map((a) => a.split("_")[0]?.toLowerCase()).filter(Boolean) as string[],
  );
  const connectedList = [...connectedAppPrefixes].join(", ") || "(none)";
  parts.push(
    `🔗 INLINE CONNECT — request_connection tool
Use \`request_connection\` (instead of \`create_plan\` or \`text_response\`) when:
- The user explicitly asks to do something via a third-party service (Slack, Notion, GitHub, HubSpot, …)
- AND that service is NOT in the connected apps list above
Currently connected app prefixes: ${connectedList}
DO NOT use \`request_connection\` for Google read-only data (Gmail/Calendar/Drive) — those are handled natively even without a Composio connection.
The user will see a one-click "Connecter <app>" card in the chat. After they connect, they'll re-ask and you can fulfil the action.`,
  );

  // ── Write-op safety rule (only meaningful if we have write access) ──
  if (writeActions.length > 0) {
    parts.push(
      `⚠️ WRITE ACTIONS DETECTED: ${writeActions.slice(0, 30).join(", ")}${writeActions.length > 30 ? ", …" : ""}`,
    );
    parts.push(
      `Rule for ANY action that mutates the user's accounts (send / create / update / delete / post / reply / forward / revoke / refund):
1. NEVER call a write action until the user has explicitly approved the exact payload.
2. Present a clear draft (recipient/target, subject/title, body/payload) and ask "Confirmer l'envoi ?" or equivalent.
3. Only after explicit confirmation ("oui", "envoie", "go", "confirme", or similar) emit the action step.
4. If the user wants changes, revise and re-confirm BEFORE the action step.
This protects the user from irreversible side effects and is non-negotiable.`,
    );
  }

  return parts.join("\n\n");
}

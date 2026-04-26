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
} from "./system-prompt";
import { isAgentValidForDomain, getValidAgentsForDomain, type Domain } from "@/lib/capabilities/taxonomy";

export type PlanningResult =
  | { kind: "plan"; plan: Plan }
  | { kind: "direct_response"; text: string }
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

export async function planFromIntent(
  db: SupabaseClient,
  engine: RunEngine,
  userMessage: string,
  conversationHistory: ConversationMessage[],
  surface?: string,
  capabilityDomain?: string,
): Promise<PlanningResult> {
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

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: ORCHESTRATOR_MODEL,
      max_tokens: 4096,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages,
      tools: [PLAN_TOOL, RESPOND_TOOL] as unknown as Anthropic.Tool[],
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

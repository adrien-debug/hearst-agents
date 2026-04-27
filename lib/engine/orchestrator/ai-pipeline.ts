/**
 * AI Pipeline — streamText-based execution replacing the planner+executor stack.
 *
 * Instead of decomposing requests into a plan and delegating each step to
 * a specialised LLM agent, this pipeline runs a single streamText() call
 * with the user's real Composio tools attached. The model picks which tools
 * to call, the SDK invokes the execute() callbacks (which call
 * executeComposioAction()), and we forward events to the RunEventBus.
 *
 * Routing: every execution mode EXCEPT the deterministic research path
 * (runResearchReport) and raw retrieval (fetchProviderData) flows here.
 */

import { streamText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import { getToolsForUser } from "@/lib/connectors/composio/discovery";
import { toAiTools } from "@/lib/connectors/composio/to-ai-tools";
import { buildAgentSystemPrompt } from "./system-prompt";

export interface AiPipelineInput {
  userId: string;
  message: string;
  userDataContext?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  hasGoogle?: boolean;
  surface?: string;
}

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export async function runAiPipeline(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: AiPipelineInput,
): Promise<void> {
  // ── 1. Discover user's Composio tools ──────────────────────
  let composioTools: Awaited<ReturnType<typeof getToolsForUser>> = [];
  try {
    composioTools = await getToolsForUser(input.userId);
  } catch (err) {
    console.error("[AiPipeline] Composio discovery failed:", err);
  }

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `AI pipeline: ${composioTools.length} Composio tool(s) available`,
  });

  // ── 2. Build tool map (real execute() callbacks) ────────────
  const aiTools = toAiTools(composioTools, input.userId);
  const hasTools = Object.keys(aiTools).length > 0;

  // ── 3. Build system prompt ──────────────────────────────────
  const systemPrompt = buildAgentSystemPrompt({
    composioTools,
    hasGoogle: input.hasGoogle ?? false,
    userDataContext: input.userDataContext,
    surface: input.surface,
  });

  // ── 4. Build message history ────────────────────────────────
  const messages: ModelMessage[] = [
    ...(input.conversationHistory ?? []).map(
      (m): ModelMessage => ({ role: m.role, content: m.content }),
    ),
    { role: "user" as const, content: input.message },
  ];

  // ── 5. Run streamText ───────────────────────────────────────
  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      messages,
      tools: hasTools ? aiTools : undefined,
      // Allow up to 10 tool-call → result cycles before forcing a stop
      stopWhen: stepCountIs(10),
      temperature: 0.3,
    });

    // Track active tool calls for event emission pairing
    const toolCallNames = new Map<string, string>();

    for await (const event of result.fullStream) {
      switch (event.type) {
        case "text-delta":
          eventBus.emit({
            type: "text_delta",
            run_id: engine.id,
            delta: event.text,
          });
          break;

        case "tool-call":
          toolCallNames.set(event.toolCallId, event.toolName);
          eventBus.emit({
            type: "tool_call_started",
            run_id: engine.id,
            step_id: event.toolCallId,
            tool: event.toolName,
            providerId: "composio",
            providerLabel: "Composio",
          });
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Tool call: ${event.toolName}`,
          });
          break;

        case "tool-result":
          eventBus.emit({
            type: "tool_call_completed",
            run_id: engine.id,
            step_id: event.toolCallId,
            tool: toolCallNames.get(event.toolCallId) ?? event.toolCallId,
            providerId: "composio",
          });
          break;

        case "error":
          console.error("[AiPipeline] stream error:", event.error);
          break;

        default:
          break;
      }
    }

    // Track token usage (resolves after stream finishes)
    const usage = await result.usage;
    if (usage) {
      await engine.cost.track({
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        tool_calls: toolCallNames.size,
        latency_ms: 0,
      });
    }

    await engine.complete();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AiPipeline] streamText failed:", msg);
    await engine.fail(msg);
  }
}

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

import { streamText, stepCountIs, jsonSchema } from "ai";
import type { ModelMessage, Tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import { getToolsForUser } from "@/lib/connectors/composio/discovery";
import { toAiTools } from "@/lib/connectors/composio/to-ai-tools";
import { filterToolsByDomain, isWriteAction } from "@/lib/connectors/composio/write-guard";
import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { saveScheduledMission as persistMission } from "@/lib/engine/runtime/state/adapter";
import { appendModelMessages, getRecentModelMessages } from "@/lib/memory/store";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { buildAgentSystemPrompt } from "./system-prompt";

export interface AiPipelineInput {
  userId: string;
  message: string;
  userDataContext?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  hasGoogle?: boolean;
  surface?: string;
  /** Resolved capability domain — used to filter Composio tools to relevant apps only. */
  domain?: string;
  /** Tenant scope for multi-tenant operations (mission creation etc.). */
  tenantId?: string;
  workspaceId?: string;
  /** Conversation id used to load/persist structured ModelMessages history. */
  conversationId?: string;
}

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

/**
 * Builds the `request_connection` tool that lets the model surface an inline
 * OAuth connect card when the user asks for an action on an unconnected app.
 *
 * The execute() callback emits `app_connect_required` on the eventBus; the
 * ChatConnectInline component picks this up and renders the connect card.
 */
function buildRequestConnectionTool(
  engine: RunEngine,
  eventBus: RunEventBus,
): Tool<{ app: string; reason: string }, string> {
  return {
    description:
      "Use this ONLY when the user explicitly wants to perform an action through a third-party service (Slack, Notion, GitHub, …) that they have NOT yet connected. Triggers an inline OAuth connect card directly inside the chat — the user authorises once, then re-asks. Do NOT use this for read-only Google data (Gmail/Calendar/Drive) the user already has connected.",
    inputSchema: jsonSchema<{ app: string; reason: string }>({
      type: "object",
      required: ["app", "reason"],
      properties: {
        app: {
          type: "string",
          description:
            "The Composio app slug (lowercase). Examples: slack, notion, googlecalendar, github, hubspot, linear, jira.",
        },
        reason: {
          type: "string",
          description:
            "One-sentence French message explaining why we need this connection. Shown verbatim above the connect button.",
        },
      },
    }),
    execute: async (input: { app: string; reason: string }) => {
      eventBus.emit({
        type: "app_connect_required",
        run_id: engine.id,
        app: input.app.toLowerCase().trim(),
        reason: input.reason,
      });
      // Return value is shown to the model so it knows the event was emitted
      return `Connection request for "${input.app}" sent to the user.`;
    },
  };
}

/**
 * Builds the `create_scheduled_mission` tool — recurring automation creation
 * with a strict preview/confirm cycle.
 *
 * Step 1: model calls with `_preview: true` (default) → returns a formatted
 *         draft of the mission, no side-effect.
 * Step 2: user confirms → model calls with `_preview: false` → mission is
 *         created in the in-memory store + persisted to Supabase.
 */
interface ScheduleArgs {
  name: string;
  input: string;
  schedule: string;
  label: string;
  _preview?: boolean;
}

function buildCreateScheduledMissionTool(
  engine: RunEngine,
  eventBus: RunEventBus,
  ctx: { userId: string; tenantId: string; workspaceId: string },
): Tool<ScheduleArgs, string> {
  return {
    description:
      "Create a recurring scheduled automation (cron-style mission). " +
      "Use this ONLY when the user explicitly asks for something to run on a recurring schedule " +
      "(e.g. 'résume mes emails tous les matins', 'rappelle-moi chaque vendredi à 17h'). " +
      "Two-step protocol: ALWAYS call first with _preview: true (default) to show the draft, " +
      "then call with _preview: false ONLY after the user explicitly confirms.",
    inputSchema: jsonSchema<ScheduleArgs>({
      type: "object",
      required: ["name", "input", "schedule", "label"],
      properties: {
        name: {
          type: "string",
          description: "Short title of the mission (≤ 80 chars). E.g. 'Résumé matinal des emails'.",
        },
        input: {
          type: "string",
          description:
            "The user-facing instruction the scheduled run will execute. " +
            "E.g. 'Résume mes emails non lus de la veille et envoie un récap.' " +
            "Should be self-contained — the scheduler will re-feed it as a fresh prompt.",
        },
        schedule: {
          type: "string",
          description:
            "Cron expression in 5-field format (minute hour day month weekday). " +
            "Examples: '0 8 * * *' (daily 8am), '0 17 * * 5' (Fridays 5pm), '0 9 * * 1' (Mondays 9am).",
        },
        label: {
          type: "string",
          description:
            "Human-readable French summary of the schedule. E.g. 'Tous les jours à 8h', 'Chaque vendredi à 17h'.",
        },
        _preview: {
          type: "boolean",
          description:
            "Set to true (default) to show a draft. Set to false ONLY after the user confirms.",
          default: true,
        },
      },
    }),
    execute: async (args: ScheduleArgs) => {
      const isPreview = args._preview !== false;

      if (isPreview) {
        return [
          `📋 Draft · Mission planifiée`,
          ``,
          `**Nom** : ${args.name}`,
          `**Récurrence** : ${args.label}`,
          `**Cron** : \`${args.schedule}\``,
          `**Tâche** : ${args.input}`,
          ``,
          `↩ Réponds **confirmer** pour créer la mission, ou **annuler** pour abandonner.`,
        ].join("\n");
      }

      // Execute: create + persist mission
      const mission = createScheduledMission({
        name: args.name.slice(0, 80),
        input: args.input,
        schedule: args.schedule,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
      addMission(mission);

      void persistMission({
        id: mission.id,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        userId: mission.userId,
        name: mission.name,
        input: mission.input,
        schedule: mission.schedule,
        enabled: mission.enabled,
        createdAt: mission.createdAt,
      });

      eventBus.emit({
        type: "scheduled_mission_created",
        run_id: engine.id,
        mission_id: mission.id,
        name: mission.name,
        schedule: args.schedule,
      });

      return `Mission "${mission.name}" créée. Récurrence : ${args.label}.`;
    },
  };
}

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

  // Filter to domain-relevant tools only — prevents token explosion and
  // improves model decision quality (fewer irrelevant options).
  const filteredTools = filterToolsByDomain(composioTools, input.domain ?? "general");

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `AI pipeline: ${filteredTools.length}/${composioTools.length} Composio tool(s) (domain: ${input.domain ?? "general"})`,
  });

  // ── 2. Build tool map: Composio tools + request_connection + create_scheduled_mission ──
  const aiTools = {
    ...toAiTools(filteredTools, input.userId),
    request_connection: buildRequestConnectionTool(engine, eventBus),
    create_scheduled_mission: buildCreateScheduledMissionTool(engine, eventBus, {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    }),
  };

  // ── 3. Build system prompt ──────────────────────────────────
  const systemPrompt = buildAgentSystemPrompt({
    composioTools: filteredTools,
    hasGoogle: input.hasGoogle ?? false,
    userDataContext: input.userDataContext,
    surface: input.surface,
  });

  // ── 4. Build message history ────────────────────────────────
  // Prefer structured (ModelMessage) memory when a conversationId is set —
  // it preserves tool calls and tool results across turns so cross-turn
  // confirmation flows ("confirmer" 3 messages later) stay reliable.
  // Fall back to the text-only client history otherwise.
  let priorMessages: ModelMessage[] = [];
  if (input.conversationId) {
    priorMessages = await getRecentModelMessages(input.conversationId, 20);
  }
  if (priorMessages.length === 0) {
    priorMessages = (input.conversationHistory ?? []).map(
      (m): ModelMessage => ({ role: m.role, content: m.content }),
    );
  }

  const userMessage: ModelMessage = { role: "user" as const, content: input.message };
  const messages: ModelMessage[] = [...priorMessages, userMessage];

  // ── 5. Run streamText ───────────────────────────────────────
  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      messages,
      tools: aiTools,
      // Allow up to 10 tool-call → result cycles before forcing a stop
      stopWhen: stepCountIs(10),
      temperature: 0.3,
      // Cost guard. Chat replies and drafts fit comfortably in 8k tokens.
      // Long-form reports go through the deterministic research path with
      // its own budget — they don't hit this code path.
      maxOutputTokens: 8000,
    });

    // Track active tool calls for event emission pairing.
    // We also skip event emission for preview-mode write calls so that the
    // receipts UI doesn't show a fake "Sent" badge for an action that never
    // actually ran.
    const toolCallNames = new Map<string, string>();
    const skippedToolCalls = new Set<string>();

    const isInternalMetaTool = (name: string): boolean =>
      name === "request_connection" || name === "create_scheduled_mission";

    // Buffer the full assistant text so we can run a sanity check at the
    // end of the stream — the model is instructed to call request_connection
    // instead of saying "X is not connected" by text. If we still see that
    // pattern, log a warning so we know the prompt isn't holding.
    // (Emoji stripping happens at the SSE adapter so it covers every path,
    // including synthetic retrieval / research.)
    let assistantTextBuffer = "";

    for await (const event of result.fullStream) {
      switch (event.type) {
        case "text-delta": {
          assistantTextBuffer += event.text;
          eventBus.emit({
            type: "text_delta",
            run_id: engine.id,
            delta: event.text,
          });
          break;
        }

        case "tool-call": {
          toolCallNames.set(event.toolCallId, event.toolName);

          // Detect preview-mode write calls: write tool + _preview not explicitly false.
          // Both meta tools (request_connection, create_scheduled_mission) and
          // preview write calls are silenced from the chip stream.
          const args = (event.input ?? {}) as Record<string, unknown>;
          const isPreviewWrite =
            isWriteAction(event.toolName) && args._preview !== false;
          const skip = isInternalMetaTool(event.toolName) || isPreviewWrite;

          if (skip) {
            skippedToolCalls.add(event.toolCallId);
            break;
          }

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
        }

        case "tool-result": {
          if (skippedToolCalls.has(event.toolCallId)) break;
          const name = toolCallNames.get(event.toolCallId);
          eventBus.emit({
            type: "tool_call_completed",
            run_id: engine.id,
            step_id: event.toolCallId,
            tool: name ?? event.toolCallId,
            providerId: "composio",
          });

          // Auto-trigger OAuth card on Composio AUTH_REQUIRED. The token has
          // expired or was revoked — the model would otherwise just relay the
          // raw error to the user. Surfacing the connect card here makes the
          // recovery path one click instead of one chat turn.
          const out = event.output as { ok?: boolean; errorCode?: string; error?: string } | undefined;
          if (out && out.ok === false && out.errorCode === "AUTH_REQUIRED" && name) {
            const app = name.split("_")[0]?.toLowerCase();
            if (app) {
              eventBus.emit({
                type: "app_connect_required",
                run_id: engine.id,
                app,
                reason: `La connexion à ${app} a expiré ou été révoquée. Reconnecte-toi pour continuer.`,
              });
            }
          }
          break;
        }

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

    // Sanity check: the system prompt forbids "X n'est pas connecté" /
    // "X is not connected" responses — the model is supposed to call
    // request_connection instead. If we see this pattern in the streamed
    // text, log a warning so we can correlate with the conversation in
    // production and tighten the prompt further.
    const refusalPattern = /(n'est pas (connect[ée]|configur[ée])|is not connected|isn't connected|not yet connected|n'est pas (encore )?dispon)/i;
    if (refusalPattern.test(assistantTextBuffer)) {
      console.warn(
        `[AiPipeline] Prompt-violation: model wrote a "not connected" refusal ` +
          `instead of calling request_connection. run=${engine.id} userId=${input.userId} ` +
          `excerpt="${assistantTextBuffer.slice(0, 200).replace(/\s+/g, " ")}"`,
      );
    }

    // Persist the full structured turn (user message + assistant + tool
    // messages with tool-call/tool-result parts) so the next turn — which
    // may say only "confirmer" — has the original tool args available.
    if (input.conversationId) {
      try {
        const responseMessages = (await result.response).messages;
        const scope: TenantScope = {
          tenantId: input.tenantId ?? "dev-tenant",
          workspaceId: input.workspaceId ?? "dev-workspace",
          userId: input.userId,
        };
        appendModelMessages(
          input.conversationId,
          [userMessage, ...responseMessages],
          scope,
        );
      } catch (err) {
        console.error("[AiPipeline] Failed to persist structured messages:", err);
      }
    }

    await engine.complete();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AiPipeline] streamText failed:", msg);
    await engine.fail(msg);
  }
}

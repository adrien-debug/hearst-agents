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
import { z } from "zod";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import { getToolsForUser } from "@/lib/connectors/composio/discovery";
import { toAiTools } from "@/lib/connectors/composio/to-ai-tools";
import { filterToolsByDomain, isWriteAction } from "@/lib/connectors/composio/write-guard";
import {
  buildNativeGoogleTools,
  NATIVE_GOOGLE_TOOL_DESCRIPTORS,
} from "@/lib/tools/native/google";
import { buildHearstActionTools } from "@/lib/tools/native/hearst-actions";
import { buildEnrichTools } from "@/lib/tools/native/enrich";
import { buildWebSearchTools } from "@/lib/tools/native/web-search";
import { buildMarketDataTools } from "@/lib/tools/native/market-data";
import { buildExtrasServicesTools } from "@/lib/tools/native/extras-services";
import { buildResearchTools } from "@/lib/tools/native/research";
import { buildExtrasMediaTools } from "@/lib/tools/native/extras-media";
import { buildKgQueryTools } from "@/lib/tools/native/kg-query";
import { buildMissionTools } from "@/lib/tools/native/missions";
import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { saveScheduledMission as persistMission } from "@/lib/engine/runtime/state/adapter";
import { appendModelMessages, getRecentModelMessages } from "@/lib/memory/store";
import { generateBriefing } from "@/lib/memory/briefing";
import { getKgContextForUser } from "@/lib/memory/kg-context";
import { fireAndForgetIngestTurn } from "@/lib/memory/kg-ingest-pipeline";
import { getRetrievedMemoryForUser } from "@/lib/memory/retrieval-context";
import { upsertEmbedding } from "@/lib/embeddings/store";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { buildAgentSystemPrompt } from "./system-prompt";
import { storeAsset, type Asset, type AssetKind } from "@/lib/assets/types";
import { getApplicableReports } from "@/lib/reports/catalog";
import { randomUUID } from "crypto";
import { buildProposeReportSpecTool } from "@/lib/reports/spec/llm-tool";
import { defaultMetrics as defaultLlmMetrics } from "@/lib/llm/metrics";
import { canonicalHash } from "@/lib/utils/canonical-hash";
import {
  getPersonaById,
  getDefaultPersona,
  getPersonaForSurface,
} from "@/lib/personas/store";

// Schema for validating tool results from the AI pipeline
const ToolResultSchema = z.object({
  ok: z.boolean(),
  errorCode: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export interface AiPipelineInput {
  userId: string;
  message: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  surface?: string;
  /** Resolved capability domain — used to filter Composio tools to relevant apps only. */
  domain?: string;
  /** Recurring intent detected — prepends a forcing schedule directive to the prompt. */
  scheduleDirective?: boolean;
  /** Tenant scope for multi-tenant operations (mission creation etc.). */
  tenantId?: string;
  workspaceId?: string;
  /** Conversation id used to load/persist structured ModelMessages history. */
  conversationId?: string;
  /** Thread id — required for the create_artifact tool to scope assets to the right thread. */
  threadId?: string;
  /** B4 — assetIds droppés dans ChatInput. Leurs résumés/contenus sont injectés dans le user message. */
  attachedAssetIds?: string[];
  /** C4 — persona explicite à appliquer pour ce run. Si absent, fallback sur (surface → default). */
  personaId?: string;
  /** B2 abort — signal propagé depuis l'orchestrateur. Quand l'user POST
   * /api/orchestrate/abort/[runId], ce signal devient aborted et streamText
   * coupe la stream Anthropic immédiatement. */
  abortSignal?: AbortSignal;
  /**
   * Mission Memory (vague 9) — bloc XML <mission_context>…</mission_context>
   * pré-formaté à injecter dans le system prompt cacheable. Quand la mission
   * a un context_summary persisté ou des messages récents, le caller (ex:
   * /api/v2/missions/[id]/run) appelle `formatMissionContextBlock` et passe
   * la string ici. Vide / undefined = pas de mémoire mission injectée.
   */
  missionContext?: string;
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

/**
 * Builds the `create_artifact` tool — persists generated content (HTML, code,
 * markdown, JSON, etc.) as an Asset attached to the current thread, so it
 * appears in the right-panel Assets list and is previewable in the Focal stage.
 *
 * Use this when the user asks for content that should persist beyond the chat
 * (a generated HTML page, a JSON config, a Markdown document, etc.). For
 * one-shot snippets that don't need to be saved, the model should still answer
 * inline in a code block (RÈGLE ZÉRO) without calling this tool.
 */
interface CreateArtifactArgs {
  name: string;
  kind: AssetKind;
  content: string;
  contentType?: string;
  summary?: string;
}

const ARTIFACT_KIND_VALUES: AssetKind[] = [
  "report",
  "brief",
  "message",
  "document",
  "spreadsheet",
  "task",
  "event",
];

function buildCreateArtifactTool(
  engine: RunEngine,
  eventBus: RunEventBus,
  ctx: { threadId: string; userId: string; tenantId: string; workspaceId: string },
): Tool<CreateArtifactArgs, string> {
  return {
    description:
      "Persist a generated content piece (HTML page, code snippet, JSON config, Markdown doc, brief, report) " +
      "as a saved Asset attached to the current thread. The asset will appear in the right-panel Assets list " +
      "and will be previewable when clicked. " +
      "Use this when the user wants the result to persist beyond the chat. " +
      "For throwaway code snippets answered inline in a code block, do NOT call this tool — keep them inline.",
    inputSchema: jsonSchema<CreateArtifactArgs>({
      type: "object",
      required: ["name", "kind", "content"],
      properties: {
        name: {
          type: "string",
          description:
            "Short, human-readable title (≤ 80 chars). E.g. 'Logo H — page démo', 'Plan éditorial Q2', 'Config API Stripe'.",
        },
        kind: {
          type: "string",
          enum: ARTIFACT_KIND_VALUES,
          description:
            "Asset category. 'document' for HTML/code/markdown/JSON/text content, 'report' for synthesised long-form analyses, 'brief' for short briefs, 'message' for email/chat drafts, 'spreadsheet' for tabular data.",
        },
        content: {
          type: "string",
          description:
            "The full raw content of the artifact. Stored as-is so the focal preview can render it directly (HTML rendered in iframe sandbox, code in syntax-highlighted block, etc.).",
        },
        contentType: {
          type: "string",
          description:
            "Optional MIME-like hint: 'html', 'css', 'js', 'json', 'markdown', 'python', 'tsx', 'plain'. Used by the focal renderer to choose the right preview mode. Defaults to 'plain'.",
        },
        summary: {
          type: "string",
          description: "Optional one-line summary of the artifact (≤ 140 chars), shown under the title.",
        },
      },
    }),
    execute: async (args: CreateArtifactArgs) => {
      const cleanTitle = (args.name ?? "").trim();
      if (!cleanTitle) {
        return "Error: artifact title is required.";
      }
      if (!args.content || !args.content.trim()) {
        return "Error: artifact content is empty.";
      }

      // V1 AssetKind → cleaner display type (avoids "document" → "pdf"
      // mapping in adapter.mapKindToType which would mislabel HTML as PDF
      // in the right-panel Assets list).
      const displayType =
        args.contentType ??
        (args.kind === "report" ? "report"
          : args.kind === "brief" ? "brief"
          : args.kind === "spreadsheet" ? "csv"
          : args.kind === "message" ? "text"
          : "doc");

      const asset: Asset = {
        id: randomUUID(),
        threadId: ctx.threadId,
        kind: args.kind,
        title: cleanTitle.slice(0, 80),
        summary: args.summary?.slice(0, 140),
        provenance: {
          providerId: "system",
          tenantId: ctx.tenantId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          runId: engine.id,
          modelUsed: "claude-sonnet-4-6",
          // Stored as `provenance.type` so adapter.mapKindToType picks it
          // up as the originalType (priorité absolue dans le mapping).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...({ type: displayType } as any),
        },
        createdAt: Date.now(),
        contentRef: args.content,
        runId: engine.id,
      };

      // storeAsset persists to Supabase (fire-and-forget) + caches in memory.
      storeAsset(asset);

      // Map the V1 AssetKind (DB schema) to the V2 AssetType used in events,
      // so downstream consumers (right panel, focal mappers) treat it uniformly.
      const eventAssetType =
        args.kind === "report"      ? "report"
        : args.kind === "spreadsheet" ? "excel"
        : "doc";

      eventBus.emit({
        type: "asset_generated",
        run_id: engine.id,
        thread_id: ctx.threadId,
        asset_id: asset.id,
        asset_type: eventAssetType,
        name: cleanTitle,
      });

      const ct = args.contentType ?? "plain";
      return `Artifact "${cleanTitle}" (${args.kind}, ${ct}) saved. It now appears in the right-panel Assets list — click it to preview.`;
    },
  };
}

export async function runAiPipeline(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: AiPipelineInput,
): Promise<void> {
  // ── 1. Discover the two tool surfaces in parallel ──────────
  // - Native Google tools (Gmail / Calendar / Drive) backed by NextAuth
  //   tokens — the user gets these the moment they sign in via the Google
  //   provider, no Composio popup required.
  // - Composio tools for everything else (Slack, Notion, GitHub, Airtable,
  //   HubSpot, …).
  const [nativeGoogleTools, composioToolsRaw, briefingResult, kgContext, retrievedMemory] = await Promise.all([
    buildNativeGoogleTools(input.userId).catch((err) => {
      console.error("[AiPipeline] native Google discovery failed:", err);
      return {} as Record<string, unknown>;
    }),
    getToolsForUser(input.userId).catch((err) => {
      console.error("[AiPipeline] Composio discovery failed:", err);
      return [] as Awaited<ReturnType<typeof getToolsForUser>>;
    }),
    // Briefing memory : fail-soft, jamais bloquant. Si Redis ou Anthropic
    // tombent, on continue sans contexte personnalisé.
    generateBriefing({ userId: input.userId }).catch((err) => {
      console.warn("[AiPipeline] briefing fetch failed:", err);
      return null;
    }),
    // Knowledge Graph context : fail-soft. Si Supabase tombe ou pas
    // d'entités, on continue sans (le user n'a peut-être encore rien
    // ingéré).
    getKgContextForUser(input.userId, input.tenantId ?? "dev-tenant").catch((err) => {
      console.warn("[AiPipeline] KG context fetch failed:", err);
      return null;
    }),
    // Retrieved memory (LTM) : top-K embeddings sémantiques sur le
    // message courant. Fail-soft : sans OPENAI_API_KEY ou sans pgvector
    // upgradé, on continue avec une chaîne vide.
    getRetrievedMemoryForUser({
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      currentMessage: input.message,
    }).catch((err) => {
      console.warn("[AiPipeline] retrieved memory fetch failed:", err);
      return "";
    }),
  ]);

  // Filter Composio tools to domain-relevant ones (prevents token explosion).
  const filteredComposio = filterToolsByDomain(
    composioToolsRaw,
    input.domain ?? "general",
  );

  const nativeCount = Object.keys(nativeGoogleTools).length;
  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `AI pipeline: ${nativeCount} native Google tool(s) + ${filteredComposio.length}/${composioToolsRaw.length} Composio tool(s) (domain: ${input.domain ?? "general"})`,
  });

  // ── 2. Build the unified tool map ──────────────────────────
  // Native Google tools live alongside Composio tools — the model picks
  // whichever fits the user's request. Meta tools (request_connection,
  // create_scheduled_mission) are appended last.
  const hearstActionTools = buildHearstActionTools({
    scope: {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    },
    eventBus,
    runId: engine.id,
  });

  const enrichTools = buildEnrichTools();
  const webSearchTools = buildWebSearchTools();
  const marketDataTools = buildMarketDataTools();
  const extrasServicesTools = buildExtrasServicesTools();
  const researchTools = buildResearchTools({
    engine,
    eventBus,
    scope: {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    },
    threadId: input.threadId,
  });
  const extrasMediaTools = buildExtrasMediaTools({
    scope: {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    },
    eventBus,
    runId: engine.id,
    threadId: input.threadId,
  });
  const kgQueryTools = buildKgQueryTools({
    scope: {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    },
  });
  const missionTools = buildMissionTools({
    engine,
    eventBus,
    scope: {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    },
  });

  const aiTools = {
    ...nativeGoogleTools,
    ...hearstActionTools,
    ...enrichTools,
    ...webSearchTools,
    ...marketDataTools,
    ...extrasServicesTools,
    ...researchTools,
    ...extrasMediaTools,
    ...kgQueryTools,
    ...missionTools,
    ...toAiTools(filteredComposio, input.userId),
    request_connection: buildRequestConnectionTool(engine, eventBus),
    create_scheduled_mission: buildCreateScheduledMissionTool(engine, eventBus, {
      userId: input.userId,
      tenantId: input.tenantId ?? "dev-tenant",
      workspaceId: input.workspaceId ?? "dev-workspace",
    }),
    // create_artifact requires a threadId to scope the saved asset. Without
    // it (e.g. surface that doesn't pass thread_id), we omit the tool from
    // the surface so the model can't call it and fail silently.
    ...(input.threadId
      ? {
          create_artifact: buildCreateArtifactTool(engine, eventBus, {
            threadId: input.threadId,
            userId: input.userId,
            tenantId: input.tenantId ?? "dev-tenant",
            workspaceId: input.workspaceId ?? "dev-workspace",
          }),
          // propose_report_spec — compose un report cross-app (Stripe + HubSpot
          // + Gmail + …) à la volée. Asset persisté → apparaît dans focal.
          propose_report_spec: buildProposeReportSpecTool(engine, eventBus, {
            threadId: input.threadId,
            userId: input.userId,
            tenantId: input.tenantId ?? "dev-tenant",
            workspaceId: input.workspaceId ?? "dev-workspace",
          }),
        }
      : {}),
  };

  // ── 3. Build system prompt ──────────────────────────────────
  // Surface both tool families in the OUTILS section so the model knows
  // it can call gmail_send_email *or* a Composio Slack tool without
  // asking for any extra connection.
  const composioForPrompt = filteredComposio.map((t) => ({
    name: t.name,
    description: t.description,
    app: t.app,
    parameters: t.parameters,
  }));
  const nativeForPrompt =
    nativeCount > 0
      ? NATIVE_GOOGLE_TOOL_DESCRIPTORS.map((t) => ({
          name: t.name,
          description: t.description,
          app: "google",
          parameters: {} as Record<string, unknown>,
        }))
      : [];
  // Calcule les rapports applicables depuis les apps connectées pour guider le LLM
  // vers les templates du catalogue plutôt qu'une génération from scratch.
  const connectedAppNames = [...new Set([
    ...(nativeCount > 0 ? ["google", "gmail", "calendar", "drive"] : []),
    ...composioToolsRaw.map((t) => t.app.toLowerCase()),
  ])];
  const applicableReports = getApplicableReports(connectedAppNames)
    .filter((r): r is typeof r & { status: "ready" | "partial" } => r.status !== "blocked")
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      missingApps: r.missingApps,
    }));

  // C4 — Résolution persona :
  // 1. personaId explicite (override per-thread)
  // 2. persona builtin/DB associée à la surface (auto-apply heuristique)
  // 3. persona default user (is_default=true)
  // Fail-soft : tout fetch qui échoue retombe sur null → prompt sans bloc persona.
  let persona: Awaited<ReturnType<typeof getPersonaById>> = null;
  const personaScope = {
    userId: input.userId,
    tenantId: input.tenantId ?? "dev-tenant",
  };
  try {
    if (input.personaId) {
      persona = await getPersonaById(input.personaId, personaScope);
    }
    if (!persona && input.surface) {
      persona = await getPersonaForSurface(input.surface, personaScope);
    }
    if (!persona) {
      persona = await getDefaultPersona(personaScope);
    }
  } catch (err) {
    console.warn("[AiPipeline] persona resolution failed:", err);
    persona = null;
  }

  const systemPrompt = buildAgentSystemPrompt({
    composioTools: [...nativeForPrompt, ...composioForPrompt],
    surface: input.surface,
    scheduleDirective: input.scheduleDirective ?? false,
    applicableReports: applicableReports.length > 0 ? applicableReports : undefined,
    briefing: briefingResult?.text,
    kgContext: kgContext ?? undefined,
    retrievedMemory: retrievedMemory && retrievedMemory.length > 0 ? retrievedMemory : undefined,
    persona,
    missionContext: input.missionContext,
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

  // B4 — Si l'utilisateur a droppé des assets dans ChatInput, on injecte
  // leur résumé + contentRef tronqué (cap 8000 chars total) en préfixe du
  // message pour que le modèle ait le contenu en contexte.
  let userMessageContent = input.message;
  if (input.attachedAssetIds && input.attachedAssetIds.length > 0) {
    try {
      const { loadAssetById } = await import("@/lib/assets/types");
      const fetched = await Promise.all(
        input.attachedAssetIds.slice(0, 5).map((id) =>
          loadAssetById(id, {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
          }).catch(() => null),
        ),
      );
      const valid = fetched.filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (valid.length > 0) {
        const TOTAL_BUDGET = 8000;
        const perAssetBudget = Math.floor(TOTAL_BUDGET / valid.length);
        const blocks = valid.map((a) => {
          const summary = a.summary ? `Résumé: ${a.summary}\n` : "";
          const content = (a.contentRef ?? "").slice(0, perAssetBudget);
          return `--- ASSET @${a.title} (id=${a.id}, kind=${a.kind}) ---\n${summary}${content}`;
        });
        userMessageContent =
          `Le user a joint ${valid.length} asset(s) en contexte :\n\n${blocks.join("\n\n")}\n\n--- FIN ASSETS ---\n\n${input.message}`;
      }
    } catch (err) {
      console.warn("[AiPipeline] attached assets injection failed:", err);
    }
  }

  const userMessage: ModelMessage = { role: "user" as const, content: userMessageContent };
  const messages: ModelMessage[] = [...priorMessages, userMessage];

  // ── 5. Run streamText ───────────────────────────────────────
  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      // System prompt marqué cache_control: ephemeral → Anthropic cache jusqu'à
      // 5 min les tokens stables (system + tool descriptors qui y sont inlinés).
      // Gain attendu : ~60-80% input tokens sur les tours suivants.
      system: {
        role: "system" as const,
        content: systemPrompt,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      messages,
      tools: aiTools,
      // Allow up to 10 tool-call → result cycles before forcing a stop
      stopWhen: stepCountIs(10),
      temperature: 0.3,
      // Cost guard. Chat replies and drafts fit comfortably in 8k tokens.
      // Long-form reports go through the deterministic research path with
      // its own budget — they don't hit this code path.
      maxOutputTokens: 8000,
      // B2 abort : POST /api/orchestrate/abort/[runId] déclenche ce signal,
      // streamText coupe la stream Anthropic immédiatement → coût LLM stoppé.
      abortSignal: input.abortSignal,
    });

    // Track active tool calls for event emission pairing.
    // We also skip event emission for preview-mode write calls so that the
    // receipts UI doesn't show a fake "Sent" badge for an action that never
    // actually ran.
    const toolCallNames = new Map<string, string>();
    const skippedToolCalls = new Set<string>();

    // Loop detection: track tool calls with same name + args
    const toolCallLoopDetector = new Map<string, number>(); // key: toolName:argsHash -> count
    const LOOP_WARNING_THRESHOLD = 2;
    const LOOP_ABORT_THRESHOLD = 3;

    const isInternalMetaTool = (name: string): boolean =>
      name === "request_connection" || name === "create_scheduled_mission";

    // Buffer the full assistant text so we can run a sanity check at the
    // end of the stream — the model is instructed to call request_connection
    // instead of saying "X is not connected" by text. If we still see that
    // pattern, log a warning so we know the prompt isn't holding.
    // (Emoji stripping happens at the SSE adapter so it covers every path,
    // including synthetic retrieval / research.)
    let assistantTextBuffer = "";

    // Track streaming token count for runaway detection.
    // Estimate live char-based (1 token ≈ 3 chars en français — Claude
    // BPE tokenize ~3.0-3.5 ch/tok pour FR vs ~4.0 pour EN ; on prend la
    // borne basse → protection plus tôt). Réajusté vers la valeur exacte
    // à chaque event "finish-step" via `usage.outputTokens`.
    let streamingTokenCount = 0;
    const MAX_STREAMING_TOKENS = 10000; // Safety limit above maxOutputTokens

    for await (const event of result.fullStream) {
      switch (event.type) {
        case "text-delta": {
          assistantTextBuffer += event.text;

          streamingTokenCount += Math.max(1, Math.ceil(event.text.length / 3));

          // Runaway generation detection: early abort if greatly exceeding limit
          if (streamingTokenCount > MAX_STREAMING_TOKENS) {
            console.error(
              `[AiPipeline] Runaway generation detected: ${streamingTokenCount} tokens emitted. ` +
              `Max expected: ${MAX_STREAMING_TOKENS}. Aborting run ${engine.id}.`
            );
            eventBus.emit({
              type: "orchestrator_log",
              run_id: engine.id,
              message: `Response too long (${streamingTokenCount} tokens). Stopping generation.`,
            });
            throw new Error(`Runaway generation: exceeded ${MAX_STREAMING_TOKENS} tokens`);
          }

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

          // Loop detection: check if same tool with same args is called repeatedly.
          // Hash canonique (clés triées + sha256) pour éviter les faux négatifs
          // dus à l'ordre d'insertion des clés ou aux floats équivalents.
          const argsHash = canonicalHash(args);
          const loopKey = `${event.toolName}:${argsHash}`;
          const loopCount = (toolCallLoopDetector.get(loopKey) ?? 0) + 1;
          toolCallLoopDetector.set(loopKey, loopCount);

          if (loopCount >= LOOP_WARNING_THRESHOLD) {
            console.warn(
              `[AiPipeline] Potential loop detected: ${event.toolName} called ${loopCount} times with same args. ` +
              `Run=${engine.id}, step=${event.toolCallId}`
            );
            eventBus.emit({
              type: "orchestrator_log",
              run_id: engine.id,
              message: `Warning: ${event.toolName} called ${loopCount} times with identical arguments`,
            });
          }

          if (loopCount >= LOOP_ABORT_THRESHOLD) {
            console.error(
              `[AiPipeline] Loop abort: ${event.toolName} exceeded ${LOOP_ABORT_THRESHOLD} identical calls. Stopping run.`
            );
            eventBus.emit({
              type: "orchestrator_log",
              run_id: engine.id,
              message: `Loop detected: ${event.toolName} called too many times with same arguments. Stopping.`,
            });
            defaultLlmMetrics.incrementCounter("tool_loop_detected");
            throw new Error(`Tool call loop detected for ${event.toolName}`);
          }

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

          // Validate tool result with Zod schema for security
          const parseResult = ToolResultSchema.safeParse(event.output);
          if (!parseResult.success) {
            console.warn(
              `[AiPipeline] Invalid tool result format for ${name ?? event.toolCallId}:`,
              parseResult.error.issues,
            );
            break;
          }

          const out = parseResult.data;

          // Auto-trigger OAuth card on Composio AUTH_REQUIRED. The token has
          // expired or was revoked — the model would otherwise just relay the
          // raw error to the user. Surfacing the connect card here makes the
          // recovery path one click instead of one chat turn.
          if (out.ok === false && out.errorCode === "AUTH_REQUIRED" && name) {
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

        // Phase C2 — bascule du compteur runaway sur l'usage exact dès que
        // dispo (par step LLM), au lieu de garder l'estimate chars/3. Plus
        // précis en mid-stream sur les longs runs multi-step.
        case "finish-step": {
          const ev = event as unknown as { usage?: { outputTokens?: number } };
          if (typeof ev.usage?.outputTokens === "number") {
            streamingTokenCount = Math.max(streamingTokenCount, ev.usage.outputTokens);
          }
          break;
        }

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

    // Sanity check: the system prompt forbids text refusals about a missing
    // connection / missing tool — the model is supposed to call
    // request_connection instead. We log when the model slips through with
    // any of the known evasion patterns (the original "not connected" plus
    // softer variants like "je ne dispose pas d'outil X", "lag de
    // propagation", "rafraîchis et réessaie") so we can correlate with
    // production conversations and tighten the prompt further.
    const refusalPattern = new RegExp(
      [
        "n'est pas (connect[ée]|configur[ée])",
        "is not connected",
        "isn't connected",
        "not yet connected",
        "n'est pas (encore )?dispon",
        "je ne dispose pas d'outil",
        "je n'ai pas d'outil",
        "outil .{0,40}indisponible",
        "outil .{0,40}n'est pas (encore )?(disponible|propag)",
        "lag (de )?(propagation|composio)",
        "rafra[iî]chis( la page)? et (retente|r[eé]essaie)",
        "contacte (le )?support",
        "connexion (suppl[eé]mentaire|d[eé]di[eé]e|s[eé]par[eé]e)",
        "n[eé]cessitent? une connexion",
        "que je peux d[eé]clencher (à la demande)?",
        "ces? actions? n[eé]cessitent",
        "ce que je (ne )?peux (pas|faire) sans",
      ].join("|"),
      "i",
    );
    if (refusalPattern.test(assistantTextBuffer)) {
      console.warn(
        `[AiPipeline] Prompt-violation: model wrote a "missing connection / missing tool" ` +
          `refusal instead of calling request_connection. run=${engine.id} userId=${input.userId} ` +
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

    // KG auto-ingest — fire-and-forget après le run. Aucune erreur
    // d'extraction ne fait échouer le run, et la promise détache
    // immédiatement (pas de blocage du SSE close).
    if (assistantTextBuffer.trim().length > 0) {
      fireAndForgetIngestTurn({
        userId: input.userId,
        tenantId: input.tenantId ?? "dev-tenant",
        userMessage: input.message,
        assistantReply: assistantTextBuffer,
      });
    }

    // LTM auto-ingest — embed le tour (user + assistant) en background.
    // Fire-and-forget : aucune erreur ne casse le run. Si OPENAI_API_KEY
    // absent, upsertEmbedding renvoie false silencieusement.
    {
      const tenantId = input.tenantId ?? "dev-tenant";
      const turnId = input.conversationId ?? engine.id;
      if (input.message.trim().length > 0) {
        void upsertEmbedding({
          userId: input.userId,
          tenantId,
          sourceKind: "message",
          sourceId: `${turnId}:${Date.now()}:user`,
          textExcerpt: input.message,
          metadata: { role: "user", conversationId: input.conversationId ?? null, runId: engine.id },
        }).catch((err) => {
          console.warn("[AiPipeline] LTM upsert (user) failed:", err);
        });
      }
      if (assistantTextBuffer.trim().length > 0) {
        void upsertEmbedding({
          userId: input.userId,
          tenantId,
          sourceKind: "message",
          sourceId: `${turnId}:${Date.now() + 1}:assistant`,
          textExcerpt: assistantTextBuffer,
          metadata: { role: "assistant", conversationId: input.conversationId ?? null, runId: engine.id },
        }).catch((err) => {
          console.warn("[AiPipeline] LTM upsert (assistant) failed:", err);
        });
      }
    }

    await engine.complete();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AiPipeline] streamText failed:", msg);
    await engine.fail(msg);
  }
}

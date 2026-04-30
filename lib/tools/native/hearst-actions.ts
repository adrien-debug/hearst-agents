/**
 * Hearst Action tools — exposés directement à la pipeline IA.
 *
 * Tools qui déclenchent un Stage transition immédiate après exécution :
 *  - start_meeting_bot   → Recall.ai → MeetingStage
 *  - start_simulation    → DeepSeek (par la stage) → SimulationStage
 *  - generate_image      → fal.ai (job-gen) → AssetStage avec variant image
 *
 * Pattern : chaque tool fait son setup minimal (mint session, persist
 * placeholder, enqueue job), émet un `stage_request` event, retourne un
 * message court au modèle. Le client SSE reçoit l'event et téléporte
 * l'utilisateur via `setStageMode`.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { randomUUID } from "crypto";
import type { RunEventBus } from "@/lib/events/bus";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { createMeetingBot } from "@/lib/capabilities/providers/recall-ai";
import { storeAsset } from "@/lib/assets/types";
import { createVariant } from "@/lib/assets/variants";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ImageGenInput } from "@/lib/jobs/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface StartMeetingBotArgs {
  meeting_url: string;
  bot_name?: string;
}

interface StartSimulationArgs {
  scenario: string;
  variables?: Array<{ key: string; value: string }>;
}

interface GenerateImageArgs {
  prompt: string;
  style?: string;
}

/**
 * Build the Hearst Action tool map. Always returns the 3 tools — pas
 * de gating user (les tools eux-mêmes throw si l'API key manque côté
 * provider).
 */
export function buildHearstActionTools(opts: {
  scope: TenantScope;
  eventBus: RunEventBus;
  runId: string;
}): AiToolMap {
  const { scope, eventBus, runId } = opts;

  const startMeetingBot: Tool<StartMeetingBotArgs, unknown> = {
    description:
      "Lance un bot Recall.ai sur un meeting Zoom/Meet/Teams en cours. Le bot rejoint la conversation, transcrit en temps réel et détecte les action items. Use this when the user pastes a meeting URL or says 'rejoins ce meeting'.",
    inputSchema: jsonSchema<StartMeetingBotArgs>({
      type: "object",
      required: ["meeting_url"],
      properties: {
        meeting_url: { type: "string", description: "URL complète du meeting (Zoom, Google Meet, Teams)." },
        bot_name: { type: "string", description: "Nom affiché du bot dans le meeting (optionnel)." },
      },
    }),
    execute: async (args) => {
      const { botId } = await createMeetingBot({
        meetingUrl: args.meeting_url,
        botName: args.bot_name,
      });
      eventBus.emit({
        type: "stage_request",
        run_id: runId,
        stage: { mode: "meeting", meetingId: botId },
      });
      return "Bot Recall.ai lancé. Je t'amène sur le Meeting Stage.";
    },
  };

  const startSimulation: Tool<StartSimulationArgs, unknown> = {
    description:
      "Ouvre la Chambre de Simulation pour explorer un scénario business via DeepSeek R1 (3-5 scénarios chiffrés avec probabilités). Use this when the user wants to explore alternatives, model decisions, or evaluate strategic options.",
    inputSchema: jsonSchema<StartSimulationArgs>({
      type: "object",
      required: ["scenario"],
      properties: {
        scenario: { type: "string", description: "Description du scénario business à simuler." },
        variables: {
          type: "array",
          description: "Variables clés au format { key, value } (ex: budget, timeline, marché).",
          items: {
            type: "object",
            required: ["key", "value"],
            properties: {
              key: { type: "string" },
              value: { type: "string" },
            },
          },
        },
      },
    }),
    execute: async (args) => {
      eventBus.emit({
        type: "stage_request",
        run_id: runId,
        stage: { mode: "simulation", scenario: args.scenario },
      });
      return "Simulation lancée. Je t'amène sur la Chambre.";
    },
  };

  const generateImage: Tool<GenerateImageArgs, unknown> = {
    description:
      "Génère une image à partir d'un prompt texte via fal.ai. Crée un asset persisté + variant image, lance le job en background. L'utilisateur est téléporté sur l'AssetStage avec le tab image actif (l'image apparaît au polling, 5-15s).",
    inputSchema: jsonSchema<GenerateImageArgs>({
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Description textuelle de l'image à générer." },
        style: { type: "string", description: "Style artistique (ex: photorealistic, watercolor, cinematic)." },
      },
    }),
    execute: async (args) => {
      const fullPrompt = args.style ? `${args.prompt} — style: ${args.style}` : args.prompt;
      const assetId = randomUUID();

      // 1. Asset placeholder — apparaît dans la liste assets immédiatement
      // pendant que le job tourne. Le titre est tronqué pour rester lisible
      // dans les sidebars.
      // ⚠️ await CRITIQUE : createVariant ci-dessous fait un insert avec
      // foreign key sur asset_id. Sans await, race condition → variantId null
      // → updateVariant skipped dans le worker → image jamais visible.
      await storeAsset({
        id: assetId,
        threadId: scope.workspaceId,
        kind: "report",
        title: args.prompt.slice(0, 80),
        summary: args.prompt.slice(0, 200),
        contentRef: "",
        createdAt: Date.now(),
        provenance: {
          providerId: "system",
          userId: scope.userId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
        },
      });

      // 2. Variant pending — visible dans AssetVariantTabs avec dot warn
      const variantId = await createVariant({
        assetId,
        kind: "image",
        status: "pending",
        provider: "fal",
      });

      // 3. Enqueue job image-gen — le worker consume et update le variant
      const payload: ImageGenInput & { variantId: string | null; variantKind: string } = {
        jobKind: "image-gen",
        userId: scope.userId ?? "anonymous",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        assetId,
        estimatedCostUsd: 0.05,
        prompt: fullPrompt,
        provider: "fal",
        variantId,
        variantKind: "image",
      };
      try {
        await enqueueJob(payload);
      } catch (err) {
        console.error("[hearst-actions] enqueue image-gen failed:", err);
      }

      // 4. Stage transition — l'utilisateur voit l'asset apparaître + tab image
      eventBus.emit({
        type: "stage_request",
        run_id: runId,
        stage: { mode: "asset", assetId, variantKind: "image" },
      });

      return "Génération lancée. Je t'amène sur l'asset, 5-15s d'attente.";
    },
  };

  return {
    start_meeting_bot: startMeetingBot,
    start_simulation: startSimulation,
    generate_image: generateImage,
  };
}

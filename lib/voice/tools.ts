/**
 * Voice Tools — Function calling pour OpenAI Realtime (Sig 6 Pulse Vocal).
 *
 * Définitions au format OpenAI Realtime + dispatcher d'exécution. Utilisé
 * par /api/realtime/session pour brancher les tools dans la session
 * éphémère, et /api/v2/voice/tool-call pour exécuter une function call
 * reçue côté client via DataChannel.
 *
 * Diff vs lib/tools/native/hearst-actions.ts : pas d'eventBus (la voix ne
 * passe pas par l'orchestrator) — chaque tool retourne un stageRequest que
 * le client setMode directement après réception. Mêmes side-effects (mint
 * meeting bot, persist asset, enqueue job) sans le pattern run/SSE.
 */

import { randomUUID } from "crypto";
import { createMeetingBot } from "@/lib/capabilities/providers/recall-ai";
import { storeAsset } from "@/lib/assets/types";
import { createVariant } from "@/lib/assets/variants";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ImageGenInput } from "@/lib/jobs/types";
import { executeComposioAction } from "@/lib/connectors/composio/client";
import type { CanonicalScope } from "@/lib/platform/auth/scope";
import type { StagePayload } from "@/stores/stage";
import { isComposioToolName } from "./composio-bridge";

export { voiceToolDefs, type VoiceToolDef } from "./tool-defs";

export interface VoiceToolResult {
  /** Texte renvoyé au modèle Realtime via function_call_output. */
  output: string;
  /** Stage transition à appliquer côté client après réception. */
  stageRequest?: StagePayload;
}

interface ExecuteVoiceToolInput {
  name: string;
  args: Record<string, unknown>;
  scope: CanonicalScope;
}

export async function executeVoiceTool(
  input: ExecuteVoiceToolInput,
): Promise<VoiceToolResult> {
  const { name, args, scope } = input;

  switch (name) {
    case "start_meeting_bot": {
      const meetingUrl = typeof args.meeting_url === "string" ? args.meeting_url : "";
      const botName = typeof args.bot_name === "string" ? args.bot_name : undefined;
      if (!meetingUrl) {
        return { output: "Meeting URL manquante." };
      }
      const { botId } = await createMeetingBot({ meetingUrl, botName });
      return {
        output: `Bot Recall.ai lancé sur le meeting. ID: ${botId}.`,
        stageRequest: { mode: "meeting", meetingId: botId },
      };
    }

    case "start_simulation": {
      const scenario = typeof args.scenario === "string" ? args.scenario : "";
      if (!scenario) {
        return { output: "Scénario manquant." };
      }
      return {
        output: "Chambre de Simulation ouverte sur le scénario.",
        stageRequest: { mode: "simulation", scenario },
      };
    }

    case "generate_image": {
      const prompt = typeof args.prompt === "string" ? args.prompt : "";
      if (!prompt) {
        return { output: "Prompt image manquant." };
      }
      const style = typeof args.style === "string" ? args.style : undefined;
      const fullPrompt = style ? `${prompt} — style: ${style}` : prompt;
      const assetId = randomUUID();

      // await ici est essentiel : createVariant a une FK sur assets(id),
      // si l'asset n'est pas en DB au moment de l'INSERT variant, FK violation.
      await storeAsset({
        id: assetId,
        threadId: scope.workspaceId,
        kind: "report",
        title: prompt.slice(0, 80),
        summary: prompt.slice(0, 200),
        contentRef: "",
        createdAt: Date.now(),
        provenance: {
          providerId: "system",
          userId: scope.userId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
        },
      });

      const variantId = await createVariant({
        assetId,
        kind: "image",
        status: "pending",
        provider: "fal",
      });

      const payload: ImageGenInput & { variantId: string | null; variantKind: string } = {
        jobKind: "image-gen",
        userId: scope.userId,
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
        console.error("[voice-tools] enqueue image-gen failed:", err);
      }

      return {
        output: "Génération d'image lancée, 5-15 secondes.",
        stageRequest: { mode: "asset", assetId, variantKind: "image" },
      };
    }

    default:
      // Fallback Composio — tout name uppercase de la forme APP_ACTION
      // (slug Composio) est dispatché vers executeComposioAction. Le
      // userId scope est passé comme entityId Composio (= ce que la
      // plateforme considère comme l'identité connectée OAuth).
      if (isComposioToolName(name)) {
        const result = await executeComposioAction({
          action: name,
          entityId: scope.userId,
          params: args,
        });
        if (!result.ok) {
          return { output: `Erreur ${name}: ${result.error ?? "exécution échouée"}` };
        }
        // Composio renvoie un payload data hétérogène par tool. On
        // sérialise en JSON compact pour que le modèle Realtime puisse le
        // narrer en français à l'utilisateur. Tronque pour éviter de
        // saturer le contexte.
        const dataStr = JSON.stringify(result.data ?? {});
        const truncated = dataStr.length > 2000 ? `${dataStr.slice(0, 2000)}…` : dataStr;
        return { output: truncated };
      }
      return { output: `Outil ${name} inconnu.` };
  }
}

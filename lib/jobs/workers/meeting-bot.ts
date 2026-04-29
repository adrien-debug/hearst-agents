import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { createMeetingBot, getBotStatus } from "@/lib/capabilities/providers/recall-ai";
import { transcribeAudio, extractActionItems } from "@/lib/capabilities/providers/deepgram";
import { updateVariant } from "@/lib/assets/variants";
import type { MeetingBotInput, JobResult } from "@/lib/jobs/types";

const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 90 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MeetingBotPayload = MeetingBotInput & { botName?: string; variantId?: string };

const handler: WorkerHandler<MeetingBotInput> = {
  kind: "meeting-bot",

  validateInput(payload) {
    if (!payload.meetingUrl || payload.meetingUrl.trim().length === 0) {
      throw new Error("meeting-bot: meetingUrl is empty");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const p = payload as MeetingBotPayload;
    const variantId = p.variantId;

    await reportProgress(5, "Création du bot de réunion");

    // 1. Créer le bot
    const { botId } = await createMeetingBot({
      meetingUrl: p.meetingUrl,
      botName: p.botName,
    });

    await reportProgress(10, `Bot créé (${botId}), en attente de fin de réunion`);

    // 2. Poll jusqu'à status "done" ou timeout 90 min
    const deadline = Date.now() + TIMEOUT_MS;
    let botStatus = "";
    let videoUrl: string | undefined;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const statusResult = await getBotStatus(botId);
      botStatus = statusResult.status;
      videoUrl = statusResult.videoUrl;

      if (botStatus === "done") break;
      if (botStatus === "failed") {
        throw new Error(`[meeting-bot] Bot ${botId} failed`);
      }

      const elapsed = Date.now() - (deadline - TIMEOUT_MS);
      const pct = Math.min(10 + Math.floor((elapsed / TIMEOUT_MS) * 60), 70);
      await reportProgress(pct, `Réunion en cours (status: ${botStatus})`);
    }

    if (botStatus !== "done") {
      throw new Error(`[meeting-bot] Timeout 90 min atteint (bot ${botId})`);
    }

    if (!videoUrl) {
      throw new Error(`[meeting-bot] Bot terminé sans videoUrl (bot ${botId})`);
    }

    await reportProgress(72, "Transcription en cours");

    // 3. Transcrire
    const { transcript, speakers } = await transcribeAudio({ audioUrl: videoUrl });

    await reportProgress(88, "Extraction des actions");

    // 4. Extraire les action items
    const actionItems = await extractActionItems(transcript);

    await reportProgress(95, "Persistance");

    // 5. Persister le résultat
    if (variantId) {
      await updateVariant(variantId, {
        status: "ready",
        generatedAt: Date.now(),
        provider: "recall-ai",
        metadata: { transcript, speakers, actionItems },
      });
    }

    await reportProgress(100, "Réunion traitée");

    return {
      assetId: payload.assetId,
      variantId,
      actualCostUsd: 0,
      providerUsed: "recall-ai",
      metadata: { transcript, speakers, actionItems },
    };
  },
};

export function startMeetingBotWorker() {
  return startWorker(handler);
}

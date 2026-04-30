/**
 * Worker meeting-bot — Recall.ai + Deepgram extraction.
 *
 * Lifecycle :
 *  1. Le bot est déjà créé par /api/v2/meetings/start (createMeetingBot
 *     synchrone). Le worker ne fait que le suivi long.
 *  2. Polling toutes les POLL_INTERVAL_MS pour récupérer transcript partiel
 *     + status. À chaque transcript stable (>30s sans changement), on
 *     appelle extractActionItems (Haiku) en lazy update.
 *  3. Quand status === "done" ou "call_ended" : transcript final + action
 *     items finaux + fusion dans l'asset placeholder créé par la route start.
 *  4. Cleanup : deleteBot au plus tard après TIMEOUT_MS (2h).
 *
 * Sans RECALL_API_KEY le worker throw au premier poll — la route /start
 * a déjà filtré ce cas, donc le worker ne devrait jamais tourner sans clé
 * en pratique. Sans DEEPGRAM_API_KEY (clé déjà utilisée côté Recall via le
 * provider managed), extractActionItems retourne [] en silence.
 */

import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import {
  getBotStatus,
  getTranscript,
  deleteBot,
  RecallAiUnavailableError,
} from "@/lib/capabilities/providers/recall-ai";
import { extractActionItems } from "@/lib/capabilities/providers/deepgram";
import { storeAsset, loadAssetById, type Asset } from "@/lib/assets/types";
import type { MeetingBotInput, JobResult } from "@/lib/jobs/types";

const POLL_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h
const STABLE_TRANSCRIPT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_STATUSES = new Set([
  "done",
  "call_ended",
  "fatal",
  "ended_early",
  "failed",
]);

const handler: WorkerHandler<MeetingBotInput> = {
  kind: "meeting-bot",

  validateInput(payload) {
    if (!payload.meetingUrl || payload.meetingUrl.trim().length === 0) {
      throw new Error("meeting-bot: meetingUrl is empty");
    }
    if (!payload.assetId) {
      throw new Error("meeting-bot: assetId requis (créé par /api/v2/meetings/start)");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const botId = payload.assetId!;
    const startedAt = Date.now();

    await reportProgress(5, `Bot ${botId} en cours de polling`);

    let lastTranscript = "";
    let lastTranscriptChangeAt = startedAt;
    let lastActionExtractAt = 0;
    let cachedActionItems: Array<{ action: string; owner?: string; deadline?: string }> = [];
    let finalStatus = "joining";
    let finalRecordingUrl: string | undefined;

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      let status: Awaited<ReturnType<typeof getBotStatus>>;
      try {
        status = await getBotStatus(botId);
      } catch (err) {
        if (err instanceof RecallAiUnavailableError) {
          throw err;
        }
        console.warn(
          `[meeting-bot] poll error pour ${botId} :`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      finalStatus = status.status;
      finalRecordingUrl = status.videoUrl ?? finalRecordingUrl;

      let currentTranscript = status.transcript ?? "";
      try {
        const detail = await getTranscript(botId);
        if (detail.transcript && detail.transcript.length > currentTranscript.length) {
          currentTranscript = detail.transcript;
        }
      } catch {
        // ignore — fallback sur status.transcript
      }

      if (currentTranscript !== lastTranscript) {
        lastTranscript = currentTranscript;
        lastTranscriptChangeAt = Date.now();
      }

      const stableMs = Date.now() - lastTranscriptChangeAt;
      const elapsedSinceLastExtract = Date.now() - lastActionExtractAt;
      if (
        currentTranscript.trim().length > 0 &&
        stableMs > STABLE_TRANSCRIPT_MS &&
        elapsedSinceLastExtract > STABLE_TRANSCRIPT_MS
      ) {
        try {
          cachedActionItems = await extractActionItems(currentTranscript);
        } catch {
          // garde les anciens action items
        }
        lastActionExtractAt = Date.now();
      }

      const elapsed = Date.now() - startedAt;
      const pct = Math.min(10 + Math.floor((elapsed / TIMEOUT_MS) * 80), 90);
      await reportProgress(
        pct,
        `Réunion en cours (status: ${status.status}, transcript ${lastTranscript.length} chars)`,
      );

      if (TERMINAL_STATUSES.has(status.status)) {
        break;
      }
    }

    await reportProgress(92, "Finalisation du transcript");

    let finalTranscript = lastTranscript;
    try {
      const detail = await getTranscript(botId);
      if (detail.transcript) finalTranscript = detail.transcript;
    } catch {
      // ignore
    }

    let finalActionItems = cachedActionItems;
    if (finalTranscript.trim().length > 0) {
      try {
        finalActionItems = await extractActionItems(finalTranscript);
      } catch {
        // garde le cache
      }
    }

    await reportProgress(96, "Persistance asset meeting");

    const existing = await loadAssetById(botId).catch(() => null);
    const previousContent = parseContentRef(existing);
    const endedAt = Date.now();

    await storeAsset({
      id: botId,
      threadId: existing?.threadId ?? `meeting:${botId}`,
      kind: "event",
      title: existing?.title ?? `Meeting · ${new Date(startedAt).toLocaleString("fr-FR")}`,
      summary:
        finalTranscript.trim().length > 0
          ? `Réunion terminée · ${finalActionItems.length} action items`
          : "Réunion terminée sans transcript",
      createdAt: existing?.createdAt ?? startedAt,
      provenance: existing?.provenance ?? {
        providerId: "system",
        userId: payload.userId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        channelRef: payload.meetingUrl,
      },
      contentRef: JSON.stringify({
        ...previousContent,
        meetingProvider: payload.meetingProvider,
        botId,
        joinUrl: payload.meetingUrl,
        status: finalStatus,
        transcript: finalTranscript,
        actionItems: finalActionItems,
        recordingUrl: finalRecordingUrl,
        startedAt: previousContent?.startedAt ?? startedAt,
        endedAt,
      }),
    });

    void deleteBot(botId).catch(() => {});

    await reportProgress(100, "Réunion traitée");

    return {
      assetId: botId,
      actualCostUsd: 0,
      providerUsed: "recall_ai",
      metadata: {
        transcript: finalTranscript,
        actionItems: finalActionItems,
        recordingUrl: finalRecordingUrl,
        status: finalStatus,
      },
    };
  },
};

function parseContentRef(asset: Asset | null): Record<string, unknown> | null {
  if (!asset?.contentRef) return null;
  try {
    return JSON.parse(asset.contentRef) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function startMeetingBotWorker() {
  return startWorker(handler);
}

import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { heygenGenerateVideo, heygenGetStatus } from "@/lib/capabilities/providers/heygen";
import { runwayGenerateVideo, runwayGetTask } from "@/lib/capabilities/providers/runway";
import { updateVariant } from "@/lib/assets/variants";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import type { VideoGenInput, JobResult } from "@/lib/jobs/types";

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_ATTEMPTS = 60;

async function pollHeyGen(videoId: string): Promise<string> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const { status, videoUrl } = await heygenGetStatus(videoId);
    if (status === "completed" && videoUrl) return videoUrl;
    if (status === "failed") throw new Error(`[HeyGen] Vidéo échouée`);
  }
  throw new Error("[HeyGen] Timeout polling vidéo");
}

async function pollRunway(taskId: string): Promise<string> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const { status, videoUrl, error } = await runwayGetTask(taskId);
    if (status === "SUCCEEDED" && videoUrl) return videoUrl;
    if (status === "FAILED") throw new Error(`[Runway] Tâche échouée: ${error ?? ""}`);
  }
  throw new Error("[Runway] Timeout polling tâche");
}

const handler: WorkerHandler<VideoGenInput> = {
  kind: "video-gen",

  validateInput(payload) {
    if (!payload.prompt && !payload.scriptText) {
      throw new Error("video-gen: prompt ou scriptText requis");
    }
    if (!payload.provider) {
      throw new Error("video-gen: provider requis (heygen | runway)");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const variantId = (payload as VideoGenInput & { variantId?: string }).variantId
      ?? (typeof payload === "object" && payload !== null && "metadata" in payload
        ? ((payload as { metadata?: { variantId?: string } }).metadata?.variantId)
        : undefined);

    const provider = payload.provider ?? "runway";

    await reportProgress(5, "Génération vidéo en cours");

    let videoUrl: string;
    let providerUsed: string;

    if (provider === "heygen") {
      const { videoId } = await heygenGenerateVideo({
        scriptText: payload.scriptText ?? payload.prompt,
        avatarId: payload.avatarId,
        voiceId: payload.voiceId,
      });
      await reportProgress(20, `HeyGen: job ${videoId} soumis, polling…`);
      videoUrl = await pollHeyGen(videoId);
      providerUsed = "heygen";
    } else {
      const { taskId } = await runwayGenerateVideo({
        promptText: payload.prompt,
        duration: payload.durationSeconds === 10 ? 10 : 5,
      });
      await reportProgress(20, `Runway: tâche ${taskId} soumise, polling…`);
      videoUrl = await pollRunway(taskId);
      providerUsed = "runway";
    }

    await reportProgress(80, "Vidéo prête, téléchargement…");

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`[video-gen] Téléchargement vidéo échoué: ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const storage = getGlobalStorage();
    const variantKey = variantId ?? `video-${ctx.job.id}`;
    const storageKey = `video/${payload.assetId ?? "orphan"}/${variantKey}.mp4`;

    const upload = await storage.upload(storageKey, videoBuffer, {
      contentType: "video/mp4",
      tenantId: payload.tenantId,
      metadata: {
        userId: payload.userId,
        provider: providerUsed,
      },
    });

    await reportProgress(90, "Upload terminé, persistance");

    if (variantId) {
      await updateVariant(variantId, {
        status: "ready",
        storageUrl: upload.url,
        mimeType: "video/mp4",
        sizeBytes: upload.size,
        generatedAt: Date.now(),
        provider: providerUsed,
        metadata: {
          sourceUrl: videoUrl,
          provider: providerUsed,
        },
      });
    }

    await reportProgress(100, "Vidéo persistée");

    return {
      assetId: payload.assetId,
      variantId,
      storageUrl: upload.url,
      actualCostUsd: 0,
      providerUsed,
      metadata: {
        sourceUrl: videoUrl,
        provider: providerUsed,
      },
    };
  },
};

export function startVideoGenWorker() {
  return startWorker(handler);
}

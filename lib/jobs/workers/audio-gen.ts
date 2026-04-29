/**
 * Worker audio-gen — Phase B.1.
 *
 * Consomme la queue `audio-gen`. Pour chaque job :
 *  1. Appelle ElevenLabs TTS avec le texte du payload
 *  2. Upload le MP3 dans le storage global (LocalStorageProvider en dev,
 *     R2 en prod via getGlobalStorage)
 *  3. Update le row asset_variants : status="ready", storage_url, size, mime
 *  4. Settle credits côté worker-base (cf. lib/jobs/worker-base.ts)
 *
 * Pré-requis : un row asset_variants doit déjà exister avec status="pending"
 * (créé par le tool handler avant l'enqueue) + son ID est passé dans
 * payload.metadata.variantId.
 */

import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { synthesizeSpeech } from "@/lib/capabilities/providers/elevenlabs";
import { updateVariant } from "@/lib/assets/variants";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import type { AudioGenInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<AudioGenInput> = {
  kind: "audio-gen",

  validateInput(payload) {
    if (!payload.text || payload.text.trim().length === 0) {
      throw new Error("audio-gen: text is empty");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const variantId = (payload as AudioGenInput & { variantId?: string }).variantId
      ?? (typeof payload === "object" && payload !== null && "metadata" in payload
        ? ((payload as { metadata?: { variantId?: string } }).metadata?.variantId)
        : undefined);

    await reportProgress(5, "Synthèse en cours");

    // 1. ElevenLabs TTS
    const result = await synthesizeSpeech({
      text: payload.text,
      voiceId: payload.voiceId,
      modelId: payload.modelId,
    });

    await reportProgress(60, "Audio généré, upload en cours");

    // 2. Upload to storage
    const storage = getGlobalStorage();
    const variantKey = variantId ?? `audio-${ctx.job.id}`;
    const storageKey = `audio/${payload.assetId ?? "orphan"}/${variantKey}.mp3`;

    const upload = await storage.upload(storageKey, result.audio, {
      contentType: "audio/mpeg",
      tenantId: payload.tenantId,
      metadata: {
        userId: payload.userId,
        voiceUsed: result.voiceUsed,
        modelUsed: result.modelUsed,
        chars: String(result.charCount),
      },
    });

    await reportProgress(85, "Upload terminé, persistance");

    // 3. Update DB row asset_variants
    if (variantId) {
      await updateVariant(variantId, {
        status: "ready",
        storageUrl: upload.url,
        mimeType: "audio/mpeg",
        sizeBytes: upload.size,
        generatedAt: Date.now(),
        provider: "elevenlabs",
        metadata: {
          voice: result.voiceUsed,
          model: result.modelUsed,
          chars: result.charCount,
        },
      });
    }

    await reportProgress(100, "Audio prêt");

    return {
      assetId: payload.assetId,
      variantId,
      storageUrl: upload.url,
      actualCostUsd: result.costUsd,
      providerUsed: "elevenlabs",
      modelUsed: result.modelUsed,
      metadata: {
        chars: result.charCount,
        voiceId: result.voiceUsed,
      },
    };
  },
};

export function startAudioGenWorker() {
  return startWorker(handler);
}

/**
 * Worker image-gen — Phase B.2 (fal.ai).
 *
 * Consomme la queue `image-gen`. Pour chaque job :
 *  1. Appelle fal.ai (flux/schnell) avec le prompt du payload
 *  2. Télécharge l'image générée et l'upload dans le storage global
 *  3. Update le row asset_variants : status="ready", storage_url, mime, dimensions
 *  4. Settle credits via worker-base
 */

import { Buffer } from "node:buffer";
import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { falGenerate } from "@/lib/capabilities/providers/fal";
import { updateVariant } from "@/lib/assets/variants";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import type { ImageGenInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<ImageGenInput> = {
  kind: "image-gen",

  validateInput(payload) {
    if (!payload.prompt || payload.prompt.trim().length === 0) {
      throw new Error("image-gen: prompt is empty");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const variantId = (payload as ImageGenInput & { variantId?: string }).variantId
      ?? (typeof payload === "object" && payload !== null && "metadata" in payload
        ? ((payload as { metadata?: { variantId?: string } }).metadata?.variantId)
        : undefined);

    await reportProgress(5, "Génération en cours");

    // 1. fal.ai generation
    const images = await falGenerate({
      prompt: payload.prompt,
      model: payload.modelHint,
    });

    if (images.length === 0) {
      console.error("[image-gen] fal.ai returned no images for job", ctx.job.id);
      return {
        assetId: payload.assetId,
        variantId,
        actualCostUsd: 0,
        providerUsed: "fal",
        metadata: { error: "no images returned" },
      };
    }

    const image = images[0];
    await reportProgress(50, "Image générée, téléchargement");

    // 2. Download generated image
    const imgRes = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) {
      throw new Error(`image-gen: failed to fetch image from fal.ai: ${imgRes.status}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    await reportProgress(70, "Upload en cours");

    // 3. Upload to storage
    const storage = getGlobalStorage();
    const variantKey = variantId ?? `image-${ctx.job.id}`;
    const storageKey = `images/${payload.assetId ?? "orphan"}/${variantKey}.jpg`;

    const upload = await storage.upload(storageKey, imgBuffer, {
      contentType: "image/jpeg",
      tenantId: payload.tenantId,
      metadata: {
        userId: payload.userId,
        width: String(image.width),
        height: String(image.height),
        prompt: payload.prompt.slice(0, 200),
      },
    });

    await reportProgress(90, "Persistance");

    // 4. Update DB row asset_variants
    if (variantId) {
      await updateVariant(variantId, {
        status: "ready",
        storageUrl: upload.url,
        mimeType: "image/jpeg",
        sizeBytes: upload.size,
        generatedAt: Date.now(),
        provider: "fal",
        metadata: {
          width: image.width,
          height: image.height,
          model: payload.modelHint ?? "fal-ai/flux/schnell",
        },
      });
    }

    await reportProgress(100, "Image prête");

    return {
      assetId: payload.assetId,
      variantId,
      storageUrl: upload.url,
      actualCostUsd: 0.003,
      providerUsed: "fal",
      modelUsed: payload.modelHint ?? "fal-ai/flux/schnell",
      metadata: {
        width: image.width,
        height: image.height,
      },
    };
  },
};

export function startImageGenWorker() {
  return startWorker(handler);
}

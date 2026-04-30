/**
 * Worker image-gen — Phase B.2 (fal.ai).
 *
 * Consomme la queue `image-gen`. Pour chaque job :
 *  1. Enrichit le prompt user via `enrichPrompt` (suffixes stylistiques +
 *     negative prompt + params steps/guidance par mode `style`)
 *  2. Sélectionne le modèle FAL : flux-pro par défaut, schnell si
 *     "rapide / fast / draft" détecté
 *  3. Appelle fal.ai et télécharge l'image générée
 *  4. Upload dans le storage global
 *  5. Update le row asset_variants : status="ready", storage_url, mime, dimensions
 *  6. Settle credits via worker-base
 */

import { Buffer } from "node:buffer";
import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { falGenerate, FAL_DEFAULT_MODEL, FAST_MODEL } from "@/lib/capabilities/providers/fal";
import {
  enrichPrompt,
  isFastModeRequested,
  type EnrichMode,
} from "@/lib/capabilities/providers/fal-prompt-enricher";
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

    await reportProgress(5, "Enrichissement du prompt");

    // 1. Enrichissement automatique du prompt
    const style: EnrichMode = (payload.style as EnrichMode) ?? "editorial";
    const enriched = enrichPrompt(payload.prompt, style);

    // 2. Sélection modèle : fast (schnell) si user a explicitement demandé
    //    "rapide / fast / draft", sinon flux-pro (qualité éditoriale).
    //    `modelHint` overide tout (ex: appel programmatique précis).
    const fastRequested = isFastModeRequested(payload.prompt);
    const model =
      payload.modelHint ?? (fastRequested ? FAST_MODEL : FAL_DEFAULT_MODEL);

    await reportProgress(15, "Génération en cours");

    // 3. fal.ai generation
    const images = await falGenerate({
      prompt: enriched.prompt,
      model,
      negativePrompt: enriched.negative_prompt,
      numInferenceSteps: enriched.params.num_inference_steps,
      guidanceScale: enriched.params.guidance_scale,
      imageSize: enriched.params.image_size,
    });

    if (images.length === 0) {
      console.error("[image-gen] fal.ai returned no images for job", ctx.job.id);
      return {
        assetId: payload.assetId,
        variantId,
        actualCostUsd: 0,
        providerUsed: "fal",
        modelUsed: model,
        metadata: { error: "no images returned", style, model },
      };
    }

    const image = images[0];
    await reportProgress(50, "Image générée, téléchargement");

    // 4. Download generated image
    const imgRes = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) {
      throw new Error(`image-gen: failed to fetch image from fal.ai: ${imgRes.status}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    await reportProgress(70, "Upload en cours");

    // 5. Upload to storage
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
        enrichedPrompt: enriched.prompt.slice(0, 300),
        style,
        model,
      },
    });

    await reportProgress(90, "Persistance");

    // 6. Update DB row asset_variants
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
          model,
          style,
          enrichedPrompt: enriched.prompt,
          numInferenceSteps: enriched.params.num_inference_steps,
          guidanceScale: enriched.params.guidance_scale,
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
      modelUsed: model,
      metadata: {
        width: image.width,
        height: image.height,
        style,
        enrichedPrompt: enriched.prompt,
      },
    };
  },
};

export function startImageGenWorker() {
  return startWorker(handler);
}

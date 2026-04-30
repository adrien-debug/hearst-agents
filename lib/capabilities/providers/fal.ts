const FAL_BASE = "https://fal.run";
/** Modèle par défaut : flux-pro (qualité éditoriale). Pour le mode fast,
 *  utiliser explicitement `fal-ai/flux/schnell`. */
const DEFAULT_MODEL = "fal-ai/flux-pro";
export const FAST_MODEL = "fal-ai/flux/schnell";

export type FalResult = { url: string; width: number; height: number };

export async function falGenerate(params: {
  prompt: string;
  model?: string;
  imageSize?: "square_hd" | "landscape_16_9" | "portrait_4_3";
  numImages?: number;
  /** Negative prompt (anti-patterns). Ignoré silencieusement par les modèles
   *  qui ne le supportent pas. */
  negativePrompt?: string;
  /** Steps d'inférence — qualité vs vitesse. Plage typique 20-50. */
  numInferenceSteps?: number;
  /** Guidance scale — fidélité au prompt vs créativité. Plage 3-7. */
  guidanceScale?: number;
}): Promise<Array<FalResult>> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return [];

  const model = params.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  // schnell ne supporte ni negative_prompt ni guidance_scale (modèle distillé).
  const isSchnell = model.includes("schnell");

  try {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      image_size: params.imageSize ?? "square_hd",
      num_images: params.numImages ?? 1,
    };
    if (!isSchnell) {
      if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
      if (params.guidanceScale !== undefined) body.guidance_scale = params.guidanceScale;
    }
    if (params.numInferenceSteps !== undefined) {
      body.num_inference_steps = params.numInferenceSteps;
    }

    const res = await fetch(`${FAL_BASE}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[fal] generate failed ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      images?: Array<{ url: string; width: number; height: number }>;
    };
    return (json.images ?? []).map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export const FAL_DEFAULT_MODEL = DEFAULT_MODEL;

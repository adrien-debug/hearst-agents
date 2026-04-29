const FAL_BASE = "https://fal.run";
const DEFAULT_MODEL = "fal-ai/flux/schnell";

export type FalResult = { url: string; width: number; height: number };

export async function falGenerate(params: {
  prompt: string;
  model?: string;
  imageSize?: "square_hd" | "landscape_16_9" | "portrait_4_3";
  numImages?: number;
}): Promise<Array<FalResult>> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return [];

  const model = params.model ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${FAL_BASE}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: params.prompt,
        image_size: params.imageSize ?? "square_hd",
        num_images: params.numImages ?? 1,
      }),
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

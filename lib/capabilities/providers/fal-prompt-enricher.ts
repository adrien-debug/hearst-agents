/**
 * FAL Prompt Enricher — Enrichissement automatique des prompts utilisateurs
 * pour la génération d'images via fal.ai.
 *
 * Avant ce module, les prompts user étaient passés bruts à FAL → résultats
 * inégaux ("a chair") car le modèle Flux a besoin de hints stylistiques
 * pour produire la qualité attendue (éclairage, focale, format).
 *
 * On expose `enrichPrompt(userPrompt, mode?)` qui retourne :
 *   - `prompt` : prompt enrichi avec suffixes stylistiques par mode
 *   - `negative_prompt` : anti-patterns courants (low quality, blurry...)
 *   - `params` : steps + guidance + image_size optimisés par mode
 *
 * Modes supportés : editorial (default), cinematic, flat-illustration,
 * portrait, product. Détection auto des mots-clés déjà présents pour ne
 * pas dupliquer ("8k cinematic" → ne réinjecte pas "8k" ni "cinematic").
 */

export type EnrichMode =
  | "editorial"
  | "cinematic"
  | "flat-illustration"
  | "portrait"
  | "product";

export interface EnrichedPrompt {
  prompt: string;
  negative_prompt: string;
  params: {
    num_inference_steps: number;
    guidance_scale: number;
    image_size: "square_hd" | "landscape_16_9" | "portrait_4_3";
  };
}

interface ModeConfig {
  suffix: string;
  /** Mots-clés à détecter dans le prompt utilisateur pour éviter
   *  d'ajouter un suffixe redondant. */
  keywords: string[];
  negative: string;
  num_inference_steps: number;
  guidance_scale: number;
  image_size: EnrichedPrompt["params"]["image_size"];
}

const BASE_NEGATIVE =
  "low quality, blurry, cartoon, deformed, watermark, text, signature, jpeg artifacts, oversaturated, bad anatomy";

const MODES: Record<EnrichMode, ModeConfig> = {
  editorial: {
    suffix:
      "editorial photography, hasselblad, sharp focus, 8k, golden hour, fine grain, magazine cover quality",
    keywords: [
      "editorial",
      "hasselblad",
      "8k",
      "magazine",
      "golden hour",
      "fine grain",
    ],
    negative: BASE_NEGATIVE,
    num_inference_steps: 32,
    guidance_scale: 4.5,
    image_size: "square_hd",
  },
  cinematic: {
    suffix:
      "cinematic lighting, anamorphic lens, film grain, dramatic shadows, 35mm",
    keywords: ["cinematic", "anamorphic", "film grain", "35mm", "dramatic"],
    negative: BASE_NEGATIVE,
    num_inference_steps: 36,
    guidance_scale: 5,
    image_size: "landscape_16_9",
  },
  "flat-illustration": {
    suffix:
      "flat vector illustration, bold colors, minimalist, geometric shapes, clean lines, design system aesthetic",
    keywords: ["flat", "vector", "minimalist", "illustration", "geometric"],
    // Cartoon est OK ici (illustration), donc on relâche le négatif
    negative:
      "low quality, blurry, photorealistic, watermark, text, signature, deformed, jpeg artifacts",
    num_inference_steps: 28,
    guidance_scale: 6,
    image_size: "square_hd",
  },
  portrait: {
    suffix:
      "studio portrait, soft light, shallow depth of field, professional photography, 85mm lens",
    keywords: ["portrait", "85mm", "studio", "shallow depth", "soft light"],
    negative: BASE_NEGATIVE,
    num_inference_steps: 40,
    guidance_scale: 4,
    image_size: "portrait_4_3",
  },
  product: {
    suffix:
      "product photography, white background, soft shadows, studio lighting, hero shot, ultra detailed, 8k",
    keywords: [
      "product",
      "white background",
      "studio lighting",
      "hero shot",
      "8k",
    ],
    negative: BASE_NEGATIVE,
    num_inference_steps: 36,
    guidance_scale: 5.5,
    image_size: "square_hd",
  },
};

const DEFAULT_MODE: EnrichMode = "editorial";

/** Liste des modes valides (pour validation côté API/UI). */
export const ENRICH_MODES: EnrichMode[] = Object.keys(MODES) as EnrichMode[];

function dedupeSuffix(userPrompt: string, suffix: string, keywords: string[]): string {
  const lower = userPrompt.toLowerCase();
  // Si l'utilisateur a déjà mis un mot-clé clé du mode, on injecte un
  // suffixe "light" (juste les keywords manquants) plutôt que tout dumper.
  const matchedKeywords = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  if (matchedKeywords.length === 0) return suffix;

  // Filtre les fragments du suffix qui contiennent des keywords déjà
  // présents pour éviter "cinematic, cinematic lighting".
  const fragments = suffix.split(",").map((f) => f.trim());
  const filtered = fragments.filter((frag) => {
    const fragLower = frag.toLowerCase();
    return !matchedKeywords.some((kw) => fragLower.includes(kw.toLowerCase()));
  });

  return filtered.join(", ");
}

export function enrichPrompt(
  userPrompt: string,
  mode: EnrichMode = DEFAULT_MODE,
): EnrichedPrompt {
  const trimmed = userPrompt.trim();
  if (!trimmed) {
    throw new Error("[fal-prompt-enricher] userPrompt is empty");
  }

  const config = MODES[mode] ?? MODES[DEFAULT_MODE];
  const suffix = dedupeSuffix(trimmed, config.suffix, config.keywords);
  const finalPrompt = suffix.length > 0 ? `${trimmed}, ${suffix}` : trimmed;

  return {
    prompt: finalPrompt,
    negative_prompt: config.negative,
    params: {
      num_inference_steps: config.num_inference_steps,
      guidance_scale: config.guidance_scale,
      image_size: config.image_size,
    },
  };
}

/** Détecte si l'utilisateur a explicitement demandé "rapide / brouillon" — dans
 * ce cas on retombe sur flux/schnell + steps réduits dans le worker. */
export function isFastModeRequested(userPrompt: string): boolean {
  const lower = userPrompt.toLowerCase();
  return (
    lower.includes("rapide") ||
    lower.includes("fast") ||
    lower.includes("brouillon") ||
    lower.includes("draft") ||
    lower.includes("quick")
  );
}

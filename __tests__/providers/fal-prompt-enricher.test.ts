/**
 * FAL prompt enricher — couvre les modes éditoriaux, dédup keywords,
 * params steps/guidance, fast mode detection.
 */

import { describe, it, expect } from "vitest";
import {
  enrichPrompt,
  isFastModeRequested,
  ENRICH_MODES,
} from "@/lib/capabilities/providers/fal-prompt-enricher";

describe("enrichPrompt", () => {
  it("editorial mode adds magazine/hasselblad suffixes by default", () => {
    const out = enrichPrompt("a young founder at his desk");
    expect(out.prompt).toContain("a young founder at his desk");
    expect(out.prompt.toLowerCase()).toContain("editorial");
    expect(out.prompt.toLowerCase()).toContain("hasselblad");
    expect(out.prompt.toLowerCase()).toContain("8k");
    expect(out.negative_prompt).toContain("low quality");
    expect(out.negative_prompt).toContain("watermark");
    expect(out.params.num_inference_steps).toBeGreaterThanOrEqual(28);
    expect(out.params.guidance_scale).toBeGreaterThanOrEqual(3.5);
    expect(out.params.guidance_scale).toBeLessThanOrEqual(7);
  });

  it("cinematic mode adds anamorphic + film grain + 35mm", () => {
    const out = enrichPrompt("car chase in tokyo", "cinematic");
    expect(out.prompt.toLowerCase()).toContain("cinematic");
    expect(out.prompt.toLowerCase()).toContain("anamorphic");
    expect(out.prompt.toLowerCase()).toContain("35mm");
    expect(out.params.image_size).toBe("landscape_16_9");
  });

  it("portrait mode uses portrait_4_3 + 85mm", () => {
    const out = enrichPrompt("woman smiling", "portrait");
    expect(out.params.image_size).toBe("portrait_4_3");
    expect(out.prompt.toLowerCase()).toContain("85mm");
    expect(out.prompt.toLowerCase()).toContain("studio portrait");
  });

  it("flat-illustration mode allows cartoon (relaxed negative)", () => {
    const out = enrichPrompt("happy character", "flat-illustration");
    expect(out.negative_prompt).not.toContain("cartoon");
    expect(out.prompt.toLowerCase()).toContain("flat vector illustration");
  });

  it("product mode adds white background + studio lighting", () => {
    const out = enrichPrompt("a sneaker", "product");
    expect(out.prompt.toLowerCase()).toContain("white background");
    expect(out.prompt.toLowerCase()).toContain("studio lighting");
    expect(out.prompt.toLowerCase()).toContain("hero shot");
  });

  it("does not duplicate keywords already present in user prompt", () => {
    const out = enrichPrompt("an 8k cinematic portrait", "editorial");
    // "8k" déjà présent → ne doit pas être ajouté une 2e fois
    const matches8k = (out.prompt.match(/8k/gi) ?? []).length;
    expect(matches8k).toBe(1);
  });

  it("does not duplicate cinematic in cinematic mode", () => {
    const out = enrichPrompt("a cinematic shot of a city", "cinematic");
    const matchesCinematic = (out.prompt.match(/cinematic/gi) ?? []).length;
    expect(matchesCinematic).toBe(1);
  });

  it("throws on empty prompt", () => {
    expect(() => enrichPrompt("")).toThrow(/empty/i);
    expect(() => enrichPrompt("   ")).toThrow(/empty/i);
  });

  it("falls back to editorial for unknown mode", () => {
    // @ts-expect-error — test runtime fallback
    const out = enrichPrompt("a cat", "unknown-mode");
    expect(out.prompt.toLowerCase()).toContain("editorial");
  });

  it("ENRICH_MODES exposes all 5 modes", () => {
    expect(ENRICH_MODES).toEqual(
      expect.arrayContaining([
        "editorial",
        "cinematic",
        "flat-illustration",
        "portrait",
        "product",
      ]),
    );
    expect(ENRICH_MODES).toHaveLength(5);
  });
});

describe("isFastModeRequested", () => {
  it("detects 'rapide' / 'fast' / 'draft' / 'brouillon' / 'quick'", () => {
    expect(isFastModeRequested("génère ça vite, mode rapide")).toBe(true);
    expect(isFastModeRequested("a fast sketch of a cat")).toBe(true);
    expect(isFastModeRequested("brouillon d'une affiche")).toBe(true);
    expect(isFastModeRequested("draft logo")).toBe(true);
    expect(isFastModeRequested("quick mockup")).toBe(true);
  });

  it("returns false for normal prompts", () => {
    expect(isFastModeRequested("a beautiful editorial portrait")).toBe(false);
    expect(isFastModeRequested("cinematic city skyline")).toBe(false);
  });
});

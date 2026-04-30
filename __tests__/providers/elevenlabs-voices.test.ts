/**
 * ElevenLabs voice mapping — couvre la résolution tone → VoiceProfile,
 * fallback default, et tuning stab/sim/style par tone.
 */

import { describe, it, expect } from "vitest";
import {
  resolveVoiceProfile,
  listVoiceProfiles,
  SUPPORTED_TONES,
} from "@/lib/capabilities/providers/elevenlabs-voices";

describe("resolveVoiceProfile", () => {
  it("formal → voix grave masculine, stability haute", () => {
    const p = resolveVoiceProfile("formal");
    expect(p.label.toLowerCase()).toContain("formal");
    expect(p.stability).toBe(0.75);
    expect(p.similarityBoost).toBe(0.85);
    expect(p.style).toBeLessThanOrEqual(0.25); // posée
  });

  it("direct → Rachel (default historique)", () => {
    const p = resolveVoiceProfile("direct");
    expect(p.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(p.label.toLowerCase()).toContain("rachel");
  });

  it("analytical → voix mature posée", () => {
    const p = resolveVoiceProfile("analytical");
    expect(p.stability).toBe(0.75);
    expect(p.similarityBoost).toBe(0.85);
    expect(p.style).toBeLessThanOrEqual(0.25);
  });

  it("casual → stability basse, style élevé (vivant)", () => {
    const p = resolveVoiceProfile("casual");
    expect(p.stability).toBeLessThanOrEqual(0.5);
    expect(p.style).toBeGreaterThanOrEqual(0.45);
  });

  it("warm-professional → équilibré", () => {
    const p = resolveVoiceProfile("warm-professional");
    expect(p.stability).toBeCloseTo(0.6, 1);
    expect(p.similarityBoost).toBeCloseTo(0.75, 1);
    expect(p.style).toBeCloseTo(0.35, 1);
  });

  it("creative → expressif", () => {
    const p = resolveVoiceProfile("creative");
    expect(p.stability).toBeLessThanOrEqual(0.45);
    expect(p.style).toBeGreaterThanOrEqual(0.5);
  });

  it("undefined / null → default Rachel", () => {
    const p1 = resolveVoiceProfile();
    const p2 = resolveVoiceProfile(null);
    const p3 = resolveVoiceProfile("");
    expect(p1.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(p2.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(p3.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
  });

  it("tone inconnu → fallback default", () => {
    const p = resolveVoiceProfile("yelling-pirate");
    expect(p.voiceId).toBe("21m00Tcm4TlvDq8ikWAM");
  });

  it("case-insensitive sur tone", () => {
    const p = resolveVoiceProfile("FORMAL");
    expect(p.label.toLowerCase()).toContain("formal");
  });

  it("toutes les voix mappées ont un voice_id non vide + stab/sim/style valides", () => {
    for (const { tone, profile } of listVoiceProfiles()) {
      expect(profile.voiceId, `${tone} voiceId`).toMatch(/^[A-Za-z0-9]{15,30}$/);
      expect(profile.stability).toBeGreaterThanOrEqual(0);
      expect(profile.stability).toBeLessThanOrEqual(1);
      expect(profile.similarityBoost).toBeGreaterThanOrEqual(0);
      expect(profile.similarityBoost).toBeLessThanOrEqual(1);
      expect(profile.style).toBeGreaterThanOrEqual(0);
      expect(profile.style).toBeLessThanOrEqual(1);
    }
  });

  it("SUPPORTED_TONES expose les 6 tones + default", () => {
    expect(SUPPORTED_TONES).toEqual(
      expect.arrayContaining([
        "formal",
        "direct",
        "analytical",
        "casual",
        "warm-professional",
        "creative",
        "default",
      ]),
    );
  });
});

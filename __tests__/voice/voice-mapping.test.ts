/**
 * OpenAI Realtime voice mapping — couvre la résolution tone → voix
 * Realtime, fallback alloy, et helper getVoiceForPersona.
 */

import { describe, it, expect } from "vitest";
import {
  resolveRealtimeVoice,
  getVoiceForPersona,
  listVoiceMapping,
  SUPPORTED_REALTIME_VOICES,
  DEFAULT_REALTIME_VOICE,
} from "@/lib/voice/voice-mapping";

describe("resolveRealtimeVoice", () => {
  it.each([
    ["formal", "ash"],
    ["analytical", "sage"],
    ["direct", "alloy"],
    ["casual", "coral"],
    ["warm-professional", "ballad"],
    ["creative", "verse"],
    ["default", "alloy"],
  ])("%s → %s", (tone, expected) => {
    expect(resolveRealtimeVoice(tone)).toBe(expected);
  });

  it("undefined / null / empty → default alloy", () => {
    expect(resolveRealtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
    expect(resolveRealtimeVoice(null)).toBe(DEFAULT_REALTIME_VOICE);
    expect(resolveRealtimeVoice("")).toBe(DEFAULT_REALTIME_VOICE);
  });

  it("tone inconnu → alloy fallback", () => {
    expect(resolveRealtimeVoice("yelling-pirate")).toBe(DEFAULT_REALTIME_VOICE);
    expect(resolveRealtimeVoice("xxx")).toBe(DEFAULT_REALTIME_VOICE);
  });

  it("case-insensitive", () => {
    expect(resolveRealtimeVoice("FORMAL")).toBe("ash");
    expect(resolveRealtimeVoice("Casual")).toBe("coral");
    expect(resolveRealtimeVoice("  Analytical  ")).toBe("sage");
  });

  it("toutes les voix résolues sont parmi les 8 supportées", () => {
    for (const { voice } of listVoiceMapping()) {
      expect(SUPPORTED_REALTIME_VOICES).toContain(voice);
    }
  });
});

describe("getVoiceForPersona", () => {
  it("personaId mappé via toneByPersonaId → voix correspondante", () => {
    const map = {
      "advisor-1": "formal",
      "coach-1": "casual",
      "concierge-1": "warm-professional",
    };
    expect(getVoiceForPersona("advisor-1", map)).toBe("ash");
    expect(getVoiceForPersona("coach-1", map)).toBe("coral");
    expect(getVoiceForPersona("concierge-1", map)).toBe("ballad");
  });

  it("personaId inconnu → alloy fallback", () => {
    expect(getVoiceForPersona("unknown", { foo: "casual" })).toBe(
      DEFAULT_REALTIME_VOICE,
    );
  });

  it("undefined personaId → alloy", () => {
    expect(getVoiceForPersona(undefined)).toBe(DEFAULT_REALTIME_VOICE);
  });

  it("aucun map fourni → alloy", () => {
    expect(getVoiceForPersona("advisor-1")).toBe(DEFAULT_REALTIME_VOICE);
  });
});

describe("SUPPORTED_REALTIME_VOICES", () => {
  it("expose les 8 voix Realtime OpenAI", () => {
    expect(SUPPORTED_REALTIME_VOICES).toHaveLength(8);
    expect(SUPPORTED_REALTIME_VOICES).toEqual(
      expect.arrayContaining([
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "sage",
        "shimmer",
        "verse",
      ]),
    );
  });
});

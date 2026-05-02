/**
 * Daily Brief generator (Sonnet) — tests prompt structure + parser tolérant +
 * fallback déterministe.
 */

import { describe, it, expect } from "vitest";
import {
  DAILY_BRIEF_SYSTEM_PROMPT,
  generateDailyBriefNarration,
} from "@/lib/daily-brief/generate";
import { DAILY_BRIEF_FEWSHOT_FR } from "@/lib/prompts/examples";
import type { DailyBriefData } from "@/lib/daily-brief/types";

const EMPTY_DATA: DailyBriefData = {
  emails: [],
  slack: [],
  calendar: [],
  github: [],
  linear: [],
  extras: [],
  sources: [],
  generatedAt: Date.now(),
  targetDate: "2026-05-01",
};

describe("DAILY_BRIEF_SYSTEM_PROMPT", () => {
  it("contient les marqueurs structurels canoniques", () => {
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("analyste exécutif");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("CIA");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("FORMAT STRICT");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("lead");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("people");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("decisions");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("signals");
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("EXEMPLES");
  });

  it("interdit l'invention", () => {
    expect(DAILY_BRIEF_SYSTEM_PROMPT).toContain("N'invente JAMAIS");
  });

  it("contient au moins 2 few-shot examples", () => {
    const matches = DAILY_BRIEF_SYSTEM_PROMPT.match(/<example>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("DAILY_BRIEF_FEWSHOT_FR", () => {
  it("a 2 exemples avec output JSON valide 4 sections", () => {
    expect(DAILY_BRIEF_FEWSHOT_FR).toHaveLength(2);
    for (const ex of DAILY_BRIEF_FEWSHOT_FR) {
      const parsed = JSON.parse(ex.output) as Record<string, unknown>;
      expect(parsed.lead).toBeTruthy();
      expect(parsed.people).toBeTruthy();
      expect(parsed.decisions).toBeTruthy();
      expect(parsed.signals).toBeTruthy();
    }
  });
});

describe("generateDailyBriefNarration (fallback déterministe)", () => {
  it("retourne fallback approprié quand ANTHROPIC_API_KEY absent (data vide)", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await generateDailyBriefNarration(EMPTY_DATA);
      expect(result.lead).toContain("Aucun signal");
      expect(result.people).toBeTruthy();
      expect(result.decisions).toBeTruthy();
      expect(result.signals).toBeTruthy();
      expect(result.costUsd).toBe(0);
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("retourne fallback dégradé avec stats quand data non-vide mais sans API key", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const result = await generateDailyBriefNarration({
        ...EMPTY_DATA,
        emails: [
          {
            id: "1",
            subject: "x",
            sender: "y",
            snippet: "z",
            receivedAt: new Date().toISOString(),
            isRead: false,
          },
        ],
        sources: ["gmail", "slack:error"],
      });
      // Le fallback dégradé ne contient PAS "Aucun signal" — il rapporte les stats
      expect(result.lead).not.toContain("Aucun signal");
      expect(result.lead.toLowerCase()).toContain("dégradé");
      expect(result.signals).toContain("slack:error");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

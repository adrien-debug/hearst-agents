/**
 * Tests pour generateMeetingDebrief — vérifie le system prompt + comportement
 * fail-soft sans API key. L'appel Anthropic réel n'est pas mocké ; on couvre
 * surtout les chemins de garde (transcript vide, pas de clé).
 */

import { describe, expect, it } from "vitest";
import {
  generateMeetingDebrief,
  DEBRIEF_SYSTEM_PROMPT,
} from "@/lib/meetings/debrief";

describe("DEBRIEF_SYSTEM_PROMPT", () => {
  it("contient les 4 sections canoniques", () => {
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("## Contexte");
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("## Décisions");
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("## Actions");
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("## Suivi");
  });

  it("interdit l'invention factuelle", () => {
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("Reste factuel");
    expect(DEBRIEF_SYSTEM_PROMPT.toLowerCase()).toContain("inférence");
  });

  it("charge la charte éditoriale unifiée (signal du bloc partagé)", () => {
    // Le bloc charte contient « VOIX HEARST » et « zéro emoji » — signal qu'il
    // est bien injecté par composeEditorialPrompt en tête.
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("VOIX HEARST");
    expect(DEBRIEF_SYSTEM_PROMPT.toLowerCase()).toContain("zéro emoji");
  });

  it("cap explicite à 350 mots", () => {
    expect(DEBRIEF_SYSTEM_PROMPT).toContain("350 mots");
  });
});

describe("generateMeetingDebrief (gardes)", () => {
  it("retourne null si transcript vide", async () => {
    const result = await generateMeetingDebrief({
      transcript: "",
      actionItems: [],
    });
    expect(result).toBeNull();
  });

  it("retourne null si transcript whitespace only", async () => {
    const result = await generateMeetingDebrief({
      transcript: "   \n\n   ",
      actionItems: [],
    });
    expect(result).toBeNull();
  });

  it("retourne null sans ANTHROPIC_API_KEY", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await generateMeetingDebrief({
        transcript: "Adrien : Bonjour Marc, comment ça va ? Marc : Bien.",
        actionItems: [],
      });
      expect(result).toBeNull();
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

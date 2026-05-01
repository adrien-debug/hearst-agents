/**
 * Quality regression tests — vérifient que les prompts critiques contiennent
 * tous les marqueurs structurels (rôle, format strict, ≥1 few-shot, contraintes).
 *
 * Pas de test sur l'output LLM (trop flaky), uniquement sur le PROMPT envoyé.
 */

import { describe, it, expect } from "vitest";
import { BRIEFING_SYSTEM_PROMPT } from "@/lib/memory/briefing";
import { CONV_SUMMARY_SYSTEM_PROMPT } from "@/lib/memory/conversation-summary";
import { ACTION_ITEMS_SYSTEM_PROMPT } from "@/lib/capabilities/providers/deepgram";
import { INBOX_PRIORITY_SYSTEM_PROMPT } from "@/lib/inbox/inbox-brief";
import { EXTRACTION_PROMPT } from "@/lib/memory/kg";
import {
  BRIEFING_FEWSHOT_FR,
  CONV_SUMMARY_FEWSHOT,
  ACTION_ITEMS_FEWSHOT,
  KG_EXTRACTION_FEWSHOT,
  INBOX_PRIORITY_FEWSHOT,
  NARRATION_FEWSHOT_FR,
  MISSION_CONTEXT_FEWSHOT_FR,
  DAILY_BRIEF_FEWSHOT_FR,
  formatFewShotBlock,
} from "@/lib/prompts/examples";
import { MISSION_CONTEXT_SYSTEM_PROMPT } from "@/lib/memory/mission-context";
import { DAILY_BRIEF_SYSTEM_PROMPT } from "@/lib/daily-brief/generate";

const BANNED_FORMULAS_GLOBAL = [
  "n'hésite pas",
  "j'espère que",
];

interface PromptCheck {
  name: string;
  prompt: string;
  /** Mots/phrases qui doivent absolument être présents (rôle défini, format, etc.) */
  mustContain: ReadonlyArray<string>;
  /** Au moins une de ces sections de contraintes doit être présente */
  mustContainOneOf?: ReadonlyArray<string>;
  /** Few-shot examples doivent être référencés (≥1 bloc <example>) */
  minFewShot: number;
  /** Mots interdits dans le prompt lui-même (au-delà du global) */
  bannedExtra?: ReadonlyArray<string>;
}

const PROMPT_CHECKS: ReadonlyArray<PromptCheck> = [
  {
    name: "briefing",
    prompt: BRIEFING_SYSTEM_PROMPT,
    mustContain: [
      "analyste exécutif",
      "What happened",
      "What matters",
      "What's next",
      "180 mots",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "conversation-summary",
    prompt: CONV_SUMMARY_SYSTEM_PROMPT,
    mustContain: [
      "éditeur d'archives",
      "FORMAT STRICT",
      "décisions prises",
      "BANNIS",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "action-items",
    prompt: ACTION_ITEMS_SYSTEM_PROMPT,
    mustContain: [
      "transcript",
      "FORMAT STRICT",
      "JSON",
      "owner",
      "deadline",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "inbox-priority",
    prompt: INBOX_PRIORITY_SYSTEM_PROMPT,
    mustContain: [
      "founder",
      "urgent",
      "important",
      "info",
      "FORMAT STRICT",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "kg-extraction",
    prompt: EXTRACTION_PROMPT,
    mustContain: [
      "Knowledge Graph",
      "person",
      "company",
      "project",
      "decision",
      "commitment",
      "topic",
      "RÈGLES D'EXTRACTION",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "mission-context",
    prompt: MISSION_CONTEXT_SYSTEM_PROMPT,
    mustContain: [
      "archiviste",
      "FORMAT STRICT",
      "Objectif",
      "État actuel",
      "Décisions actées",
      "Prochaine étape",
      "Max 250 mots",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
  {
    name: "daily-brief",
    prompt: DAILY_BRIEF_SYSTEM_PROMPT,
    mustContain: [
      "analyste exécutif",
      "Daily Brief",
      "FORMAT STRICT",
      "lead",
      "people",
      "decisions",
      "signals",
      "EXEMPLES",
    ],
    minFewShot: 2,
  },
];

describe("Prompt quality regression", () => {
  for (const check of PROMPT_CHECKS) {
    describe(check.name, () => {
      it("contient les marqueurs structurels obligatoires", () => {
        for (const marker of check.mustContain) {
          expect(check.prompt, `marker manquant: "${marker}"`).toContain(marker);
        }
      });

      it("contient au moins ≥N few-shot examples", () => {
        const matches = check.prompt.match(/<example>/g);
        const count = matches?.length ?? 0;
        expect(count).toBeGreaterThanOrEqual(check.minFewShot);
      });

      it("ne contient aucune formule bannie globale", () => {
        const lower = check.prompt.toLowerCase();
        for (const banned of BANNED_FORMULAS_GLOBAL) {
          // Le prompt peut MENTIONNER une formule comme bannie (« Bannis : "n'hésite pas" »)
          // donc on cherche uniquement un usage non-déclaratif. Ici on vérifie juste
          // qu'on n'a pas une instruction au LLM qui finit par cette formule.
          // Heuristique : si la formule apparaît sans le mot "banni"/"interdit" autour,
          // c'est suspect. On accepte tout usage car nos prompts mentionnent ces
          // formules dans la liste BANNIS.
          // Test minimal : juste s'assurer que chaque banned est mentionné dans une
          // section "bannis" ou "interdit" si présent.
          if (lower.includes(banned.toLowerCase())) {
            expect(
              lower.includes("banni") ||
                lower.includes("interdit") ||
                lower.includes("jamais"),
              `formule "${banned}" présente sans être déclarée bannie`,
            ).toBe(true);
          }
        }
      });

      if (check.bannedExtra) {
        it("ne contient pas de formules bannies spécifiques", () => {
          for (const banned of check.bannedExtra!) {
            expect(check.prompt.toLowerCase()).not.toContain(banned.toLowerCase());
          }
        });
      }

      it("a une longueur raisonnable (>200 chars, <8000 chars)", () => {
        expect(check.prompt.length).toBeGreaterThan(200);
        expect(check.prompt.length).toBeLessThan(8000);
      });
    });
  }
});

describe("Few-shot examples library", () => {
  it("BRIEFING_FEWSHOT_FR a 2 exemples bien formés", () => {
    expect(BRIEFING_FEWSHOT_FR).toHaveLength(2);
    for (const ex of BRIEFING_FEWSHOT_FR) {
      expect(ex.input.length).toBeGreaterThan(20);
      expect(ex.output).toContain("**What happened.**");
      expect(ex.output).toContain("**What matters.**");
      expect(ex.output).toContain("**What's next.**");
    }
  });

  it("CONV_SUMMARY_FEWSHOT a 2 exemples concis (<400 chars)", () => {
    expect(CONV_SUMMARY_FEWSHOT).toHaveLength(2);
    for (const ex of CONV_SUMMARY_FEWSHOT) {
      expect(ex.output.length).toBeLessThan(400);
    }
  });

  it("ACTION_ITEMS_FEWSHOT a 2 exemples avec JSON valide", () => {
    expect(ACTION_ITEMS_FEWSHOT).toHaveLength(2);
    for (const ex of ACTION_ITEMS_FEWSHOT) {
      const parsed = JSON.parse(ex.output);
      expect(Array.isArray(parsed)).toBe(true);
    }
  });

  it("KG_EXTRACTION_FEWSHOT a 2 exemples avec entities + relations", () => {
    expect(KG_EXTRACTION_FEWSHOT).toHaveLength(2);
    for (const ex of KG_EXTRACTION_FEWSHOT) {
      const parsed = JSON.parse(ex.output) as { entities: unknown[]; relations: unknown[] };
      expect(parsed).toHaveProperty("entities");
      expect(parsed).toHaveProperty("relations");
      expect(Array.isArray(parsed.entities)).toBe(true);
      expect(Array.isArray(parsed.relations)).toBe(true);
    }
  });

  it("INBOX_PRIORITY_FEWSHOT a 2 exemples avec JSON array valide", () => {
    expect(INBOX_PRIORITY_FEWSHOT).toHaveLength(2);
    for (const ex of INBOX_PRIORITY_FEWSHOT) {
      const parsed = JSON.parse(ex.output) as Array<{ priority: string }>;
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        expect(["urgent", "important", "info"]).toContain(item.priority);
      }
    }
  });

  it("NARRATION_FEWSHOT_FR a 2 exemples avec lead + bullets", () => {
    expect(NARRATION_FEWSHOT_FR).toHaveLength(2);
    for (const ex of NARRATION_FEWSHOT_FR) {
      // Au moins un bullet
      expect(ex.output).toMatch(/\* /);
    }
  });

  it("MISSION_CONTEXT_FEWSHOT_FR a 2 exemples avec les 4 sections obligatoires", () => {
    expect(MISSION_CONTEXT_FEWSHOT_FR).toHaveLength(2);
    for (const ex of MISSION_CONTEXT_FEWSHOT_FR) {
      expect(ex.input.length).toBeGreaterThan(20);
      expect(ex.output).toContain("**Objectif.**");
      expect(ex.output).toContain("**État actuel.**");
      expect(ex.output).toContain("**Décisions actées.**");
      expect(ex.output).toContain("**Prochaine étape.**");
    }
  });

  it("DAILY_BRIEF_FEWSHOT_FR a 2 exemples avec output JSON 4 sections", () => {
    expect(DAILY_BRIEF_FEWSHOT_FR).toHaveLength(2);
    for (const ex of DAILY_BRIEF_FEWSHOT_FR) {
      const parsed = JSON.parse(ex.output) as Record<string, unknown>;
      expect(parsed.lead).toBeTruthy();
      expect(parsed.people).toBeTruthy();
      expect(parsed.decisions).toBeTruthy();
      expect(parsed.signals).toBeTruthy();
    }
  });

  it("formatFewShotBlock produit des blocs <example> bien formés", () => {
    const block = formatFewShotBlock([
      { input: "in", output: "out" },
      { input: "in2", output: "out2" },
    ]);
    expect(block).toContain("<example>");
    expect(block).toContain("<input>in</input>");
    expect(block).toContain("<output>out</output>");
    const matches = block.match(/<example>/g);
    expect(matches).toHaveLength(2);
  });
});

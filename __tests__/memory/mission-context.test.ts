/**
 * Mission Memory (vague 9) — tests unit du helper.
 *
 * Couvre :
 *  - formatMissionContextBlock : assemblage XML + cap chars + skip empty
 *  - getMissionContext : fail-soft sur Supabase down (preload path)
 *  - prompt MISSION_CONTEXT_SYSTEM_PROMPT : structure + few-shot
 *
 * Pas de test sur l'output LLM (trop flaky) — uniquement sur les inputs
 * envoyés et la mécanique de composition.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks hoisted ─────────────────────────────────────────────
const { searchEmbeddings, getKgContextForUser } = vi.hoisted(() => ({
  searchEmbeddings: vi.fn(),
  getKgContextForUser: vi.fn(),
}));

vi.mock("@/lib/embeddings/store", () => ({
  searchEmbeddings,
}));

vi.mock("@/lib/memory/kg-context", () => ({
  getKgContextForUser,
}));

// Pour le helper : on stubbe aussi getServerSupabase pour retourner null
// → listMissionMessages tombera sur le fallback "[]" sans throw.
vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => null,
  requireServerSupabase: () => {
    throw new Error("not used in tests");
  },
}));

// updateScheduledMission est appelé depuis updateMissionContextSummary
// uniquement (pas testé ici), on stubbe pour éviter l'import lourd.
vi.mock("@/lib/engine/runtime/state/adapter", () => ({
  updateScheduledMission: vi.fn().mockResolvedValue(true),
  getScheduledMissions: vi.fn().mockResolvedValue([]),
}));

import {
  formatMissionContextBlock,
  getMissionContext,
  MISSION_CONTEXT_SYSTEM_PROMPT,
  type MissionContext,
} from "@/lib/memory/mission-context";

// ── formatMissionContextBlock ────────────────────────────────

describe("formatMissionContextBlock", () => {
  it("retourne string vide si tout est vide (pas de section)", () => {
    const ctx: MissionContext = {
      summary: null,
      summaryUpdatedAt: null,
      recentMessages: [],
      retrievedMemory: "",
      kgSnippet: null,
      generatedAt: Date.now(),
    };
    expect(formatMissionContextBlock(ctx)).toBe("");
  });

  it("encapsule dans <mission_context>...</mission_context> avec sections", () => {
    const ctx: MissionContext = {
      summary: "**Objectif.** Closer Acme.",
      summaryUpdatedAt: 1000,
      recentMessages: [
        {
          id: "1",
          missionId: "m",
          userId: "u",
          tenantId: null,
          role: "user",
          content: "où en est-on ?",
          runId: null,
          createdAt: 0,
          metadata: {},
        },
      ],
      retrievedMemory: "",
      kgSnippet: null,
      generatedAt: Date.now(),
    };
    const out = formatMissionContextBlock(ctx);
    expect(out).toContain("<mission_context>");
    expect(out).toContain("</mission_context>");
    expect(out).toContain("[Résumé de mission]");
    expect(out).toContain("Closer Acme");
    expect(out).toContain("[Notes récentes (chronologique)]");
    expect(out).toContain("Utilisateur: où en est-on ?");
  });

  it("cap chaque message à 240 chars", () => {
    const longContent = "x".repeat(500);
    const ctx: MissionContext = {
      summary: null,
      summaryUpdatedAt: null,
      recentMessages: [
        {
          id: "1",
          missionId: "m",
          userId: "u",
          tenantId: null,
          role: "assistant",
          content: longContent,
          runId: null,
          createdAt: 0,
          metadata: {},
        },
      ],
      retrievedMemory: "",
      kgSnippet: null,
      generatedAt: Date.now(),
    };
    const out = formatMissionContextBlock(ctx);
    expect(out).toContain("Assistant:");
    // 240 chars de "x" + ellipsis
    const match = out.match(/x+/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[0].length).toBeLessThanOrEqual(240);
    }
    expect(out).toContain("…");
  });
});

// ── getMissionContext (fail-soft path) ────────────────────────

describe("getMissionContext", () => {
  beforeEach(() => {
    searchEmbeddings.mockReset();
    getKgContextForUser.mockReset();
  });

  it("compose summary preload + retrieval + KG en parallèle", async () => {
    searchEmbeddings.mockResolvedValue([
      {
        sourceKind: "message" as const,
        sourceId: "msg-1",
        textExcerpt: "souvenir pertinent",
        similarity: 0.9,
        createdAt: "2026-04-30T00:00:00Z",
        metadata: {},
      },
    ]);
    getKgContextForUser.mockResolvedValue("Personnes : Sarah");

    const ctx = await getMissionContext({
      missionId: "m1",
      userId: "u1",
      tenantId: "t1",
      missionInput: "Suivi deal Acme",
      preloadedSummary: "**Objectif.** Closer Acme.",
      preloadedSummaryUpdatedAt: 1234,
    });

    expect(ctx.summary).toBe("**Objectif.** Closer Acme.");
    expect(ctx.summaryUpdatedAt).toBe(1234);
    expect(ctx.kgSnippet).toBe("Personnes : Sarah");
    expect(ctx.retrievedMemory).toContain("souvenir pertinent");
    // Supabase mocké null → liste messages = []
    expect(ctx.recentMessages).toEqual([]);
    expect(searchEmbeddings).toHaveBeenCalledWith({
      userId: "u1",
      tenantId: "t1",
      queryText: "Suivi deal Acme",
      k: 5,
    });
  });

  it("ne plante pas si retrieval throw", async () => {
    searchEmbeddings.mockRejectedValue(new Error("network"));
    getKgContextForUser.mockResolvedValue(null);

    const ctx = await getMissionContext({
      missionId: "m1",
      userId: "u1",
      tenantId: "t1",
      missionInput: "test",
      preloadedSummary: null,
    });

    expect(ctx.retrievedMemory).toBe("");
    expect(ctx.kgSnippet).toBeNull();
    expect(ctx.summary).toBeNull();
  });
});

// ── MISSION_CONTEXT_SYSTEM_PROMPT structure ───────────────────

describe("MISSION_CONTEXT_SYSTEM_PROMPT", () => {
  it("contient les marqueurs structurels canoniques", () => {
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("archiviste");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("FORMAT STRICT");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("Objectif");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("État actuel");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("Décisions actées");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("Prochaine étape");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("Max 250 mots");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("EXEMPLES");
  });

  it("force la ré-écriture (pas l'append)", () => {
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toMatch(/RÉ-ÉCRIS|ré-écris/);
  });

  it("interdit les formules creuses", () => {
    // Le prompt liste des bannissements explicites
    expect(MISSION_CONTEXT_SYSTEM_PROMPT.toLowerCase()).toContain("voici");
    expect(MISSION_CONTEXT_SYSTEM_PROMPT).toContain("Bannis");
  });

  it("contient au moins 2 few-shot examples (pattern <example>)", () => {
    const matches = MISSION_CONTEXT_SYSTEM_PROMPT.match(/<example>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

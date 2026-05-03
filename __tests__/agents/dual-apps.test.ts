import { describe, expect, it } from "vitest";
import {
  detectDualAppConflicts,
  buildDualAppGuidance,
} from "@/lib/agents/dual-apps";

describe("detectDualAppConflicts", () => {
  it("retourne aucun conflit quand 1 seule app par catégorie", () => {
    const conflicts = detectDualAppConflicts(["linear", "slack", "github"]);
    expect(conflicts).toEqual([]);
  });

  it("détecte un conflit tâches Linear/Jira", () => {
    const conflicts = detectDualAppConflicts(["linear", "jira", "slack"]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].category).toBe("tâches");
    expect(conflicts[0].apps).toContain("linear");
    expect(conflicts[0].apps).toContain("jira");
  });

  it("détecte plusieurs conflits simultanés", () => {
    const conflicts = detectDualAppConflicts([
      "linear",
      "jira",
      "slack",
      "discord",
      "github",
      "gitlab",
    ]);
    const cats = conflicts.map((c) => c.category).sort();
    expect(cats).toEqual(["code", "communication", "tâches"]);
  });

  it("insensible à la casse", () => {
    const conflicts = detectDualAppConflicts(["LINEAR", "Jira"]);
    expect(conflicts).toHaveLength(1);
  });

  it("ignore les apps non listées dans DUAL_APP_GROUPS", () => {
    const conflicts = detectDualAppConflicts(["linear", "unknown_app"]);
    expect(conflicts).toEqual([]);
  });
});

describe("buildDualAppGuidance", () => {
  it("retourne null sans conflit", () => {
    expect(buildDualAppGuidance(["slack"])).toBeNull();
    expect(buildDualAppGuidance([])).toBeNull();
  });

  it("génère un texte explicite avec conflit", () => {
    const text = buildDualAppGuidance(["linear", "jira"]);
    expect(text).not.toBeNull();
    expect(text).toContain("DUAL-APPS");
    expect(text).toContain("tâches");
    expect(text).toContain("linear");
    expect(text).toContain("jira");
    expect(text).toContain("DEMANDE");
  });

  it("liste plusieurs catégories en cas de conflits multiples", () => {
    const text = buildDualAppGuidance(["linear", "jira", "github", "gitlab"]);
    expect(text).not.toBeNull();
    expect(text).toContain("tâches");
    expect(text).toContain("code");
  });
});

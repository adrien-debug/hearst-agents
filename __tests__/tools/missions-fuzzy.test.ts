/**
 * Tests des helpers purs de lib/tools/native/missions.ts
 * (matchMissions + normalize). Helpers de fuzzy match sans I/O — testables
 * directement.
 */

import { describe, expect, it } from "vitest";
import { matchMissions, normalize } from "@/lib/tools/native/missions";

describe("normalize", () => {
  it("lowercase + retire accents + trim", () => {
    expect(normalize("  Synthèse Hebdomadaire  ")).toBe("synthese hebdomadaire");
    expect(normalize("RAPPORT PIPELINE")).toBe("rapport pipeline");
    expect(normalize("Élève")).toBe("eleve");
  });

  it("retourne empty string sur whitespace pur", () => {
    expect(normalize("   ")).toBe("");
    expect(normalize("")).toBe("");
  });
});

const FIXTURES = [
  { id: "m1", name: "Synthèse Weekly", schedule: "0 17 * * 5" },
  { id: "m2", name: "Rapport Pipeline Sales", schedule: "0 9 * * 1" },
  { id: "m3", name: "Brief matinal", schedule: "0 8 * * *" },
  { id: "m4", name: "Daily Standup", schedule: "0 10 * * 1-5" },
];

describe("matchMissions", () => {
  it("retourne empty si query vide", () => {
    expect(matchMissions("", FIXTURES)).toEqual([]);
    expect(matchMissions("   ", FIXTURES)).toEqual([]);
  });

  it("retourne empty si missions vides", () => {
    expect(matchMissions("query", [])).toEqual([]);
  });

  it("match exact (insensible casse + accents)", () => {
    const m = matchMissions("synthese weekly", FIXTURES);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("exact");
    expect(m[0].id).toBe("m1");
  });

  it("match prefix (« synthèse » → « Synthèse Weekly »)", () => {
    const m = matchMissions("synthèse", FIXTURES);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("prefix");
    expect(m[0].id).toBe("m1");
  });

  it("match substring (« sales » → « Rapport Pipeline Sales »)", () => {
    const m = matchMissions("sales", FIXTURES);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("substring");
    expect(m[0].id).toBe("m2");
  });

  it("ordre : exact > prefix > substring", () => {
    const fixtures = [
      { id: "a", name: "rapport client" },
      { id: "b", name: "Rapport" },
      { id: "c", name: "rapport pipeline" },
    ];
    const m = matchMissions("rapport", fixtures);
    expect(m).toHaveLength(3);
    expect(m[0].kind).toBe("exact"); // « Rapport » == « rapport »
    expect(m[0].id).toBe("b");
    expect(m[1].kind).toBe("prefix"); // « rapport ... » startsWith « rapport »
  });

  it("ne match pas si la query est sans rapport", () => {
    const m = matchMissions("xyz123", FIXTURES);
    expect(m).toEqual([]);
  });

  it("query plus longue que tous les noms : substring inverse (q.includes(n))", () => {
    // « Lance la mission Daily Standup avec Marc » contient « Daily Standup »
    const m = matchMissions("Lance la mission Daily Standup avec Marc", FIXTURES);
    expect(m.length).toBeGreaterThan(0);
    const standup = m.find((x) => x.id === "m4");
    expect(standup).toBeDefined();
    expect(standup!.kind).toBe("substring");
  });

  it("ignore les missions sans nom propre", () => {
    const m = matchMissions("brief", FIXTURES);
    expect(m).toHaveLength(1);
    expect(m[0].id).toBe("m3");
  });

  it("propage label / schedule dans les matches", () => {
    const fixtures = [
      { id: "x", name: "Test", schedule: "0 9 * * 1", label: "Chaque lundi à 9h" },
    ];
    const m = matchMissions("test", fixtures);
    expect(m[0].schedule).toBe("0 9 * * 1");
    expect(m[0].scheduleLabel).toBe("Chaque lundi à 9h");
  });
});

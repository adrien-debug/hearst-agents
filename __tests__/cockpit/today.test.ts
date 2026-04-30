import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks hoistés ─────────────────────────────────────────────
// Vitest exige `vi.hoisted` pour les variables référencées dans `vi.mock`.

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getAllMissionOps: vi.fn(),
  getScheduledMissions: vi.fn(),
  getMemoryMissions: vi.fn(),
  getConnectionsByScope: vi.fn(),
  getApplicableReports: vi.fn(),
  getAllServiceIds: vi.fn(),
  getProviderIdForService: vi.fn(),
}));

vi.mock("@/lib/memory/conversation-summary", () => ({
  getSummary: mocks.getSummary,
}));

vi.mock("@/lib/engine/runtime/missions/ops-store", () => ({
  getAllMissionOps: mocks.getAllMissionOps,
}));

vi.mock("@/lib/engine/runtime/state/adapter", () => ({
  getScheduledMissions: mocks.getScheduledMissions,
}));

vi.mock("@/lib/engine/runtime/missions/store", () => ({
  getAllMissions: mocks.getMemoryMissions,
}));

vi.mock("@/lib/connectors/control-plane/store", () => ({
  getConnectionsByScope: mocks.getConnectionsByScope,
}));

vi.mock("@/lib/integrations/service-map", () => ({
  getAllServiceIds: mocks.getAllServiceIds,
  getProviderIdForService: mocks.getProviderIdForService,
}));

// Le catalog reste réel — on a besoin de CATALOG.slice() pour favorites,
// mais on remplace getApplicableReports pour contrôler les suggestions.
vi.mock("@/lib/reports/catalog", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/reports/catalog");
  return {
    ...actual,
    getApplicableReports: mocks.getApplicableReports,
  };
});

import { getCockpitToday } from "@/lib/cockpit/today";

const SCOPE = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
};

describe("getCockpitToday", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSummary.mockResolvedValue("");
    mocks.getAllMissionOps.mockReturnValue(new Map());
    mocks.getScheduledMissions.mockResolvedValue([]);
    mocks.getMemoryMissions.mockReturnValue([]);
    mocks.getConnectionsByScope.mockResolvedValue([]);
    mocks.getApplicableReports.mockReturnValue([]);
    mocks.getAllServiceIds.mockReturnValue([]);
    mocks.getProviderIdForService.mockReturnValue(undefined);
  });

  it("retourne un payload complet avec toutes les sections", async () => {
    const payload = await getCockpitToday(SCOPE);

    expect(payload).toHaveProperty("briefing");
    expect(payload).toHaveProperty("agenda");
    expect(payload).toHaveProperty("missionsRunning");
    expect(payload).toHaveProperty("watchlist");
    expect(payload).toHaveProperty("suggestions");
    expect(payload).toHaveProperty("favoriteReports");
    expect(payload).toHaveProperty("mockSections");
    expect(payload).toHaveProperty("generatedAt");
    expect(typeof payload.generatedAt).toBe("number");
  });

  it("renvoie 4 KPIs mock dans la watchlist (MVP)", async () => {
    const payload = await getCockpitToday(SCOPE);
    expect(payload.watchlist).toHaveLength(4);
    expect(payload.watchlist.map((k) => k.id)).toEqual(["mrr", "arr", "runway", "pipeline"]);
    expect(payload.watchlist.every((k) => k.source === "mock")).toBe(true);
    expect(payload.mockSections).toContain("watchlist");
  });

  it("retourne les 3 premiers reports du catalogue comme favoris", async () => {
    const payload = await getCockpitToday(SCOPE);
    expect(payload.favoriteReports).toHaveLength(3);
    payload.favoriteReports.forEach((r) => {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("title");
      expect(r).toHaveProperty("domain");
    });
  });

  it("briefing.empty=true quand aucun summary", async () => {
    mocks.getSummary.mockResolvedValue("");
    const payload = await getCockpitToday(SCOPE);
    expect(payload.briefing.empty).toBe(true);
    expect(payload.briefing.body).toBeNull();
  });

  it("briefing.empty=false quand un summary existe, body extrait", async () => {
    mocks.getSummary.mockResolvedValue(
      "Headline du jour\n\nDétails plus longs sur les actions à prendre.",
    );
    const payload = await getCockpitToday(SCOPE);
    expect(payload.briefing.empty).toBe(false);
    expect(payload.briefing.headline).toBe("Headline du jour");
    expect(payload.briefing.body).toContain("Détails plus longs");
  });

  it("briefing tronque le body à 360 chars max avec ellipsis", async () => {
    const long = "A".repeat(600);
    mocks.getSummary.mockResolvedValue(`Headline\n\n${long}`);
    const payload = await getCockpitToday(SCOPE);
    expect(payload.briefing.body).toBeTruthy();
    expect(payload.briefing.body!.length).toBeLessThanOrEqual(361);
    expect(payload.briefing.body!.endsWith("…")).toBe(true);
  });

  it("missionsRunning join scheduled + live ops, running first", async () => {
    mocks.getMemoryMissions.mockReturnValue([
      {
        id: "mission-a",
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Daily KPI",
        input: "...",
        schedule: "0 9 * * *",
        enabled: true,
        createdAt: 1000,
        lastRunAt: 2000,
        lastRunId: "run-1",
      },
    ]);
    mocks.getAllMissionOps.mockReturnValue(
      new Map([
        [
          "mission-a",
          {
            status: "running" as const,
            runningSince: 1234,
          },
        ],
      ]),
    );
    const payload = await getCockpitToday(SCOPE);
    expect(payload.missionsRunning).toHaveLength(1);
    expect(payload.missionsRunning[0].id).toBe("mission-a");
    expect(payload.missionsRunning[0].name).toBe("Daily KPI");
    expect(payload.missionsRunning[0].status).toBe("running");
    expect(payload.missionsRunning[0].runningSince).toBe(1234);
  });

  it("missionsRunning inclut les ops orphelines en fallback (scheduler restart)", async () => {
    mocks.getAllMissionOps.mockReturnValue(
      new Map([
        [
          "mission-orphan",
          {
            status: "running" as const,
            runningSince: 5000,
          },
        ],
      ]),
    );
    const payload = await getCockpitToday(SCOPE);
    expect(payload.missionsRunning).toHaveLength(1);
    expect(payload.missionsRunning[0].id).toBe("mission-orphan");
    expect(payload.missionsRunning[0].status).toBe("running");
  });

  it("suggestions vides quand aucune connexion", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([]);
    const payload = await getCockpitToday(SCOPE);
    expect(payload.suggestions).toEqual([]);
  });

  it("suggestions remplies quand connexions + reports applicables", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([
      { provider: "stripe", status: "connected" },
    ]);
    mocks.getApplicableReports.mockReturnValue([
      {
        id: "founder-cockpit",
        title: "Founder Cockpit",
        description: "MRR + pipeline",
        status: "ready",
        requiredApps: ["stripe"],
        missingApps: [],
      },
    ]);
    const payload = await getCockpitToday(SCOPE);
    expect(payload.suggestions).toHaveLength(1);
    expect(payload.suggestions[0].id).toBe("founder-cockpit");
    expect(payload.suggestions[0].requiredApps).toEqual(["stripe"]);
  });

  it("fail-soft : une source en erreur ne casse pas les autres", async () => {
    mocks.getSummary.mockRejectedValue(new Error("redis down"));
    mocks.getAllMissionOps.mockImplementation(() => {
      throw new Error("memory store crash");
    });
    mocks.getConnectionsByScope.mockRejectedValue(new Error("supabase 500"));

    const payload = await getCockpitToday(SCOPE);

    // Briefing fallback
    expect(payload.briefing.empty).toBe(true);
    // Missions fallback
    expect(payload.missionsRunning).toEqual([]);
    // Suggestions fallback
    expect(payload.suggestions).toEqual([]);
    // Watchlist + favorites toujours là (mock + catalog purs)
    expect(payload.watchlist).toHaveLength(4);
    expect(payload.favoriteReports.length).toBeGreaterThan(0);
  });
});

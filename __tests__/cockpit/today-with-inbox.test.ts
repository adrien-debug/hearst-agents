/**
 * getCockpitToday — vérifie l'intégration de la section inbox dans le payload.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getAllMissionOps: vi.fn(),
  getScheduledMissions: vi.fn(),
  getMemoryMissions: vi.fn(),
  getConnectionsByScope: vi.fn(),
  getApplicableReports: vi.fn(),
  getAllServiceIds: vi.fn(),
  getProviderIdForService: vi.fn(),
  loadLatestInboxBrief: vi.fn(),
}));

vi.mock("@/lib/memory/conversation-summary", () => ({ getSummary: mocks.getSummary }));
vi.mock("@/lib/engine/runtime/missions/ops-store", () => ({ getAllMissionOps: mocks.getAllMissionOps }));
vi.mock("@/lib/engine/runtime/state/adapter", () => ({ getScheduledMissions: mocks.getScheduledMissions }));
vi.mock("@/lib/engine/runtime/missions/store", () => ({ getAllMissions: mocks.getMemoryMissions }));
vi.mock("@/lib/connectors/control-plane/store", () => ({ getConnectionsByScope: mocks.getConnectionsByScope }));
vi.mock("@/lib/integrations/service-map", () => ({
  getAllServiceIds: mocks.getAllServiceIds,
  getProviderIdForService: mocks.getProviderIdForService,
}));
vi.mock("@/lib/inbox/store", () => ({ loadLatestInboxBrief: mocks.loadLatestInboxBrief }));

vi.mock("@/lib/cockpit/watchlist-live", () => ({
  getLiveWatchlist: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/cockpit/agenda-live", () => ({
  getLiveAgenda: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/reports/catalog", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/reports/catalog");
  return { ...actual, getApplicableReports: mocks.getApplicableReports };
});

import { getCockpitToday } from "@/lib/cockpit/today";

const SCOPE = { userId: "user-1", tenantId: "tenant-1", workspaceId: "ws-1" };

describe("getCockpitToday — section inbox", () => {
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
    mocks.loadLatestInboxBrief.mockResolvedValue(null);
  });

  it("inbox vide + needsConnection=true quand aucune connexion", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([]);
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox).toBeDefined();
    expect(payload.inbox.brief).toBeNull();
    expect(payload.inbox.stale).toBe(true);
    expect(payload.inbox.needsConnection).toBe(true);
  });

  it("needsConnection=false quand Gmail connecté", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([
      { provider: "google", status: "connected" },
    ]);
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox.needsConnection).toBe(false);
  });

  it("brief retourné si présent + stale=false si frais (<1h)", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([
      { provider: "slack", status: "connected" },
    ]);
    mocks.loadLatestInboxBrief.mockResolvedValue({
      items: [
        {
          id: "email:1",
          kind: "email",
          priority: "urgent",
          title: "Test",
          summary: "...",
          source: "x@acme.com",
          suggestedActions: [],
          receivedAt: Date.now(),
        },
      ],
      generatedAt: Date.now() - 5 * 60_000, // 5 min ago
      sources: ["gmail"],
      empty: false,
    });
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox.brief).toBeTruthy();
    expect(payload.inbox.brief!.items).toHaveLength(1);
    expect(payload.inbox.stale).toBe(false);
  });

  it("stale=true si brief > 1h ancien", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([
      { provider: "slack", status: "connected" },
    ]);
    mocks.loadLatestInboxBrief.mockResolvedValue({
      items: [],
      generatedAt: Date.now() - 2 * 3600_000, // 2h ago
      sources: ["gmail"],
      empty: true,
    });
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox.stale).toBe(true);
  });

  it("filtre les items snoozed jusqu'à demain", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([
      { provider: "slack", status: "connected" },
    ]);
    mocks.loadLatestInboxBrief.mockResolvedValue({
      items: [
        {
          id: "email:1",
          kind: "email",
          priority: "info",
          title: "Visible",
          summary: "...",
          source: "a",
          suggestedActions: [],
          receivedAt: Date.now(),
        },
        {
          id: "email:2",
          kind: "email",
          priority: "info",
          title: "Snoozed",
          summary: "...",
          source: "b",
          suggestedActions: [],
          receivedAt: Date.now(),
          snoozedUntil: Date.now() + 3600_000,
        },
      ],
      generatedAt: Date.now(),
      sources: ["gmail"],
      empty: false,
    });
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox.brief!.items).toHaveLength(1);
    expect(payload.inbox.brief!.items[0].id).toBe("email:1");
  });

  it("fail-soft : si loadLatestInboxBrief throw, inbox reste cohérent", async () => {
    mocks.getConnectionsByScope.mockResolvedValue([]);
    mocks.loadLatestInboxBrief.mockRejectedValue(new Error("db down"));
    const payload = await getCockpitToday(SCOPE);
    expect(payload.inbox).toBeDefined();
    expect(payload.inbox.brief).toBeNull();
    expect(payload.inbox.stale).toBe(true);
  });
});

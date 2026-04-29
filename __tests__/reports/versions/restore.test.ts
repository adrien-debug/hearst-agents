/**
 * Tests unitaires : lib/reports/versions/restore.ts
 *
 * On mocke getVersion, createVersion et runReport pour vérifier
 * le comportement de restauration sans connexion réelle.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

// Mock des dépendances avant l'import du module testé
vi.mock("@/lib/reports/versions/store", () => ({
  getVersion: vi.fn(),
  createVersion: vi.fn(),
}));

vi.mock("@/lib/reports/engine/run-report", () => ({
  runReport: vi.fn(),
}));

// Import après les mocks
import { restoreVersion } from "@/lib/reports/versions/restore";
import { getVersion, createVersion } from "@/lib/reports/versions/store";
import { runReport } from "@/lib/reports/engine/run-report";
import type { VersionFull, VersionSummary } from "@/lib/reports/versions/store";
import type { RunReportResult } from "@/lib/reports/engine/run-report";

// ── Données de test ───────────────────────────────────────────

const SPEC = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  meta: {
    title: "Test",
    summary: "",
    domain: "founder",
    persona: "founder",
    cadence: "ad-hoc",
    confidentiality: "internal",
  },
  scope: { tenantId: "T", workspaceId: "W" },
  sources: [{ id: "s1", kind: "composio", spec: { action: "ACT", params: {} } }],
  transforms: [],
  blocks: [{ id: "k1", type: "kpi", dataRef: "s1", layout: { col: 1, row: 0 }, props: {} }],
  refresh: { mode: "manual", cooldownHours: 0 },
  cacheTTL: { raw: 60, transform: 600, render: 3600 },
  createdAt: 0,
  updatedAt: 0,
};

const PAYLOAD = {
  __reportPayload: true as const,
  specId: SPEC.id,
  version: 1,
  generatedAt: 0,
  blocks: [],
  scalars: {},
};

const MOCK_VERSION: VersionFull = {
  id: "v1",
  assetId: "asset-A",
  tenantId: "T",
  versionNumber: 2,
  triggeredBy: "manual",
  signalsCount: 0,
  createdAt: "2026-04-30T00:00:00Z",
  specSnapshot: SPEC as never,
  renderSnapshot: PAYLOAD,
  signalsSnapshot: null,
  narrationSnapshot: null,
};

const MOCK_RUN_RESULT: RunReportResult = {
  payload: PAYLOAD,
  narration: "narration fraîche",
  signals: [],
  severity: "info",
  cacheHit: { render: false },
  cost: { inputTokens: 0, outputTokens: 0, usd: 0, exceeded: false },
  durationMs: 10,
};

const MOCK_NEW_VERSION: VersionSummary = {
  id: "v3",
  assetId: "asset-A",
  tenantId: "T",
  versionNumber: 3,
  triggeredBy: "manual",
  signalsCount: 0,
  createdAt: "2026-04-30T01:00:00Z",
};

// ── Tests ─────────────────────────────────────────────────────

describe("restoreVersion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retourne ok:true avec la nouvelle version créée", async () => {
    vi.mocked(getVersion).mockResolvedValue(MOCK_VERSION);
    vi.mocked(runReport).mockResolvedValue(MOCK_RUN_RESULT);
    vi.mocked(createVersion).mockResolvedValue(MOCK_NEW_VERSION);

    const outcome = await restoreVersion({
      assetId: "asset-A",
      versionNumber: 2,
      tenantId: "T",
      userId: "user-X",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.newVersion.versionNumber).toBe(3);
    expect(outcome.newVersion.id).toBe("v3");
  });

  it("ne remplace PAS la version existante — crée une nouvelle version", async () => {
    vi.mocked(getVersion).mockResolvedValue(MOCK_VERSION);
    vi.mocked(runReport).mockResolvedValue(MOCK_RUN_RESULT);
    vi.mocked(createVersion).mockResolvedValue(MOCK_NEW_VERSION);

    await restoreVersion({ assetId: "asset-A", versionNumber: 2, tenantId: "T" });

    // createVersion doit être appelé (pas update/delete)
    expect(createVersion).toHaveBeenCalledOnce();
    // getVersion ne doit pas être appelé avec une intention d'update
    // (vérifié par le fait qu'on ne mock pas d'update et que createVersion est la seule écriture)
  });

  it("retourne version_not_found si getVersion retourne null", async () => {
    vi.mocked(getVersion).mockResolvedValue(null);

    const outcome = await restoreVersion({ assetId: "X", versionNumber: 99, tenantId: "T" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("version_not_found");
    expect(runReport).not.toHaveBeenCalled();
  });

  it("retourne run_failed si runReport throw", async () => {
    vi.mocked(getVersion).mockResolvedValue(MOCK_VERSION);
    vi.mocked(runReport).mockRejectedValue(new Error("LLM timeout"));

    const outcome = await restoreVersion({ assetId: "asset-A", versionNumber: 2, tenantId: "T" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("run_failed");
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("retourne persist_failed si createVersion retourne null", async () => {
    vi.mocked(getVersion).mockResolvedValue(MOCK_VERSION);
    vi.mocked(runReport).mockResolvedValue(MOCK_RUN_RESULT);
    vi.mocked(createVersion).mockResolvedValue(null);

    const outcome = await restoreVersion({ assetId: "asset-A", versionNumber: 2, tenantId: "T" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("persist_failed");
  });

  it("force noCache:true dans les options de runReport", async () => {
    vi.mocked(getVersion).mockResolvedValue(MOCK_VERSION);
    vi.mocked(runReport).mockResolvedValue(MOCK_RUN_RESULT);
    vi.mocked(createVersion).mockResolvedValue(MOCK_NEW_VERSION);

    await restoreVersion({ assetId: "asset-A", versionNumber: 2, tenantId: "T" });

    expect(runReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ noCache: true }),
    );
  });
});

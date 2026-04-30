/**
 * Tests d'intégration légers du flux Studio :
 *   - création d'un spec (block KPI minimal)
 *   - validation Zod
 *   - run via /api/v2/reports/[specId]/run en mode custom (template)
 *
 * Le pipeline réel est mocké au niveau du store (loadTemplate) et de
 * runReport pour rester unit-test pur.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportSpecSchema } from "@/lib/reports/spec/schema";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      isDevFallback: false,
    },
    error: null,
  })),
}));

const storeMock = {
  loadTemplate: vi.fn(),
  saveTemplate: vi.fn(),
  listTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
};

vi.mock("@/lib/reports/templates/store", () => storeMock);

const runReportMock = vi.fn();
vi.mock("@/lib/reports/engine/run-report", () => ({
  runReport: runReportMock,
}));

vi.mock("@/lib/reports/sources", () => ({
  createSourceLoader: () => async () => new Map(),
}));

vi.mock("@/lib/assets/types", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/assets/types");
  return {
    ...actual,
    storeAsset: vi.fn(),
  };
});

function makeSpec() {
  return {
    id: "00000000-0000-4000-8000-100000000077",
    version: 1,
    meta: {
      title: "Studio test",
      summary: "",
      domain: "founder" as const,
      persona: "founder" as const,
      cadence: "ad-hoc" as const,
      confidentiality: "internal" as const,
    },
    scope: {
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      userId: "00000000-0000-0000-0000-000000000001",
    },
    sources: [
      {
        id: "src_a",
        kind: "http" as const,
        spec: { url: "https://example.com", method: "GET" as const },
      },
    ],
    transforms: [],
    blocks: [
      {
        id: "b_kpi",
        type: "kpi" as const,
        label: "Revenue",
        dataRef: "src_a",
        layout: { col: 1 as const, row: 0 },
        props: { field: "value" },
      },
    ],
    refresh: { mode: "manual" as const, cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("Studio — spec construction & validation", () => {
  it("un spec minimal block KPI passe la validation Zod", () => {
    const spec = makeSpec();
    const result = reportSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it("rejette un spec dont blocks[].dataRef pointe sur un id inconnu", () => {
    const spec = makeSpec();
    spec.blocks[0].dataRef = "ghost";
    const result = reportSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });
});

describe("/api/v2/reports/[specId]/run — custom spec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("résout un custom spec via loadTemplate quand specId hors catalog", async () => {
    storeMock.loadTemplate.mockResolvedValueOnce(makeSpec());
    runReportMock.mockResolvedValueOnce({
      payload: { __reportPayload: true, specId: "x", version: 1, generatedAt: 0, blocks: [], scalars: {} },
      narration: "",
      signals: [],
      severity: "info",
      cacheHit: false,
      cost: 0,
      durationMs: 0,
    });

    const { POST } = await import("@/app/api/v2/reports/[specId]/run/route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sample: true }),
      }) as never,
      { params: Promise.resolve({ specId: "00000000-0000-4000-8000-100000000077" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.title).toBe("Studio test");
    expect(body.sample).toBe(true);
    // En mode sample, pas de persistence asset.
    expect(body.assetId).toBeNull();
    expect(storeMock.loadTemplate).toHaveBeenCalledOnce();
  });

  it("404 si ni catalog ni template ne match", async () => {
    storeMock.loadTemplate.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v2/reports/[specId]/run/route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ specId: "totally-unknown" }) },
    );
    expect(res.status).toBe(404);
  });
});

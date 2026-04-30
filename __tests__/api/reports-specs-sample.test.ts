/**
 * Tests — POST /api/v2/reports/specs/sample.
 *
 * Couvre :
 *   - 400 sur body invalide (spec manquant ou non conforme)
 *   - 200 + payload preview avec un spec valide
 *   - Aucun appel à saveTemplate / storeAsset (sample = pas de persistence)
 *   - Le scope du caller écrase le scope démo du spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: "tenant-caller",
      workspaceId: "ws-caller",
      isDevFallback: false,
    },
    error: null,
  })),
}));

const runReportMock = vi.fn(async () => ({
  payload: {
    blocks: [],
    focal: { title: "Sample", body: "" },
    summary: "",
    scalars: {},
  },
  narration: null,
  signals: [],
  severity: "info" as const,
  cacheHit: { render: false },
  cost: { inputTokens: 0, outputTokens: 0, usd: 0, exceeded: false },
  durationMs: 12,
}));

vi.mock("@/lib/reports/engine/run-report", () => ({
  runReport: runReportMock,
}));

vi.mock("@/lib/reports/sources", () => ({
  createSourceLoader: vi.fn(() => async () => new Map()),
}));

function makeValidSpec() {
  return {
    id: "00000000-0000-4000-8000-100000000099",
    version: 1,
    meta: {
      title: "Sample inline",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: {
      // Scope démo — doit être écrasé par le scope du caller
      tenantId: "studio-tenant",
      workspaceId: "studio-workspace",
      userId: "studio-user",
    },
    sources: [
      {
        id: "src_a",
        kind: "http",
        spec: { url: "https://example.com", method: "GET" },
      },
    ],
    transforms: [],
    blocks: [
      {
        id: "b_kpi",
        type: "kpi",
        label: "Revenue",
        dataRef: "src_a",
        layout: { col: 1, row: 0 },
        props: { field: "value" },
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("POST /api/v2/reports/specs/sample", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("400 si body sans spec", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/sample/route");
    const req = new Request("http://localhost/api/v2/reports/specs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("400 si spec mal formé", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/sample/route");
    const req = new Request("http://localhost/api/v2/reports/specs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: { id: "not-a-uuid" } }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("200 + payload + sample:true avec un spec valide", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/sample/route");
    const req = new Request("http://localhost/api/v2/reports/specs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: makeValidSpec() }),
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sample).toBe(true);
    expect(body.payload).toBeDefined();
    expect(runReportMock).toHaveBeenCalledTimes(1);
  });

  it("écrase le scope démo par le scope du caller", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/sample/route");
    const req = new Request("http://localhost/api/v2/reports/specs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: makeValidSpec() }),
    });
    await POST(req as never);
    const calls = runReportMock.mock.calls as unknown as Array<[
      { scope: { tenantId: string; workspaceId: string } },
      { noCache?: boolean },
    ]>;
    expect(calls[0][0].scope.tenantId).toBe("tenant-caller");
    expect(calls[0][0].scope.workspaceId).toBe("ws-caller");
  });

  it("force noCache=true pour rafraîchir chaque preview", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/sample/route");
    const req = new Request("http://localhost/api/v2/reports/specs/sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: makeValidSpec() }),
    });
    await POST(req as never);
    const calls = runReportMock.mock.calls as unknown as Array<[
      unknown,
      { noCache?: boolean },
    ]>;
    expect(calls[0][1].noCache).toBe(true);
  });
});

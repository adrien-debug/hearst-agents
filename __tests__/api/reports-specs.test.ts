/**
 * /api/v2/reports/specs — CRUD custom report specs (templates).
 *
 * Couvre :
 *   - GET liste : retourne les templates du tenant
 *   - POST : 401 sans auth, 400 si body invalide, 201 avec template
 *   - GET catalog (/api/v2/reports) : merge builtin + custom avec kind
 *   - PATCH / DELETE / GET single : route [specId]
 *
 * Mocks : requireScope (auth), saveTemplate / loadTemplate / listTemplates /
 * updateTemplate / deleteTemplate (store).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  saveTemplate: vi.fn(),
  loadTemplate: vi.fn(),
  listTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
};

vi.mock("@/lib/reports/templates/store", () => storeMock);

function makeValidSpec() {
  return {
    id: "00000000-0000-4000-8000-100000000099",
    version: 1,
    meta: {
      title: "Test custom",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: {
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      userId: "00000000-0000-0000-0000-000000000001",
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

describe("/api/v2/reports/specs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET liste retourne les templates du tenant", async () => {
    storeMock.listTemplates.mockResolvedValueOnce([
      {
        id: "t1",
        tenantId: "tenant-1",
        createdBy: "u",
        name: "Mon spec",
        domain: "founder",
        isPublic: false,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const { GET } = await import("@/app/api/v2/reports/specs/route");
    const res = await GET(new Request("http://localhost/api/v2/reports/specs") as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.specs).toHaveLength(1);
    expect(body.specs[0].name).toBe("Mon spec");
  });

  it("POST refuse un body invalide", async () => {
    const { POST } = await import("@/app/api/v2/reports/specs/route");
    const req = new Request("http://localhost/api/v2/reports/specs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("POST persiste un nouveau spec", async () => {
    storeMock.saveTemplate.mockResolvedValueOnce({
      id: "t-new",
      tenantId: "tenant-1",
      createdBy: "u",
      name: "Nouveau",
      spec: makeValidSpec(),
      isPublic: false,
      createdAt: "",
      updatedAt: "",
      domain: "founder",
    });
    const { POST } = await import("@/app/api/v2/reports/specs/route");
    const req = new Request("http://localhost/api/v2/reports/specs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Nouveau",
        spec: makeValidSpec(),
      }),
    });
    const res = await POST(req as never);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.template.id).toBe("t-new");
    expect(storeMock.saveTemplate).toHaveBeenCalledTimes(1);
    // Le scope du caller doit avoir été injecté dans le spec persisté.
    const arg = storeMock.saveTemplate.mock.calls[0][0];
    expect(arg.spec.scope.tenantId).toBe("tenant-1");
  });

  it("POST 500 si saveTemplate retourne null (DB indispo)", async () => {
    storeMock.saveTemplate.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v2/reports/specs/route");
    const req = new Request("http://localhost/api/v2/reports/specs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", spec: makeValidSpec() }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });
});

describe("/api/v2/reports/specs/[specId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 404 si spec inconnu", async () => {
    storeMock.loadTemplate.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/v2/reports/specs/[specId]/route");
    const res = await GET(
      new Request("http://localhost/x") as never,
      { params: Promise.resolve({ specId: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET retourne le spec", async () => {
    storeMock.loadTemplate.mockResolvedValueOnce(makeValidSpec());
    const { GET } = await import("@/app/api/v2/reports/specs/[specId]/route");
    const res = await GET(
      new Request("http://localhost/x") as never,
      { params: Promise.resolve({ specId: "t1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.spec.meta.title).toBe("Test custom");
  });

  it("PATCH met à jour", async () => {
    storeMock.updateTemplate.mockResolvedValueOnce({
      id: "t1",
      tenantId: "tenant-1",
      createdBy: "u",
      name: "Renamed",
      spec: makeValidSpec(),
      isPublic: false,
      createdAt: "",
      updatedAt: "",
      domain: "founder",
    });
    const { PATCH } = await import("@/app/api/v2/reports/specs/[specId]/route");
    const req = new Request("http://localhost/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await PATCH(
      req as never,
      { params: Promise.resolve({ specId: "t1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.template.name).toBe("Renamed");
  });

  it("DELETE répond ok", async () => {
    storeMock.deleteTemplate.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("@/app/api/v2/reports/specs/[specId]/route");
    const res = await DELETE(
      new Request("http://localhost/x") as never,
      { params: Promise.resolve({ specId: "t1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
  });
});

describe("/api/v2/reports (catalog merge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne builtin + custom avec kind", async () => {
    storeMock.listTemplates.mockResolvedValueOnce([
      {
        id: "t-custom",
        tenantId: "tenant-1",
        createdBy: "u",
        name: "Mon custom",
        domain: "founder",
        description: "desc",
        isPublic: false,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const { GET } = await import("@/app/api/v2/reports/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    const customs = body.catalog.filter((c: { kind: string }) => c.kind === "custom");
    const builtins = body.catalog.filter((c: { kind: string }) => c.kind === "builtin");
    expect(customs.length).toBe(1);
    expect(customs[0].title).toBe("Mon custom");
    expect(builtins.length).toBeGreaterThan(0);
  });
});

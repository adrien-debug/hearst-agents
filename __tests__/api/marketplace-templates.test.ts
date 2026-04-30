/**
 * Tests — endpoints REST marketplace.
 *
 * Couvre :
 *   - GET list : filtres, scope renvoyé
 *   - POST publish : 401 sans auth, 400 si invalide, 201 OK
 *   - POST clone : 404 si template inconnu, 201 sinon
 *   - POST rate : 400 si rating hors plage, 200 OK
 *   - POST report : 400 si reason vide, 200 OK
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

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
  publishTemplate: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  cloneTemplate: vi.fn(),
  rateTemplate: vi.fn(),
  reportTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
  listRatings: vi.fn(),
};

vi.mock("@/lib/marketplace/store", () => storeMock);

vi.mock("@/lib/marketplace/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
  __clearRateLimits: vi.fn(),
}));

function makeWorkflowPayload() {
  return {
    nodes: [
      {
        id: "trig",
        kind: "trigger",
        label: "Manual",
        config: { mode: "manual" },
      },
    ],
    edges: [],
    startNodeId: "trig",
    version: 1,
  };
}

describe("GET /api/v2/marketplace/templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne la liste avec scope.isDevFallback", async () => {
    storeMock.listTemplates.mockResolvedValueOnce([
      {
        id: "t1",
        kind: "workflow",
        title: "Daily standup",
        description: null,
        authorDisplayName: "Hearst",
        authorTenantId: "hearst",
        tags: ["standup"],
        ratingAvg: 0,
        ratingCount: 0,
        cloneCount: 5,
        isFeatured: false,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const { GET } = await import("@/app/api/v2/marketplace/templates/route");
    const res = await GET(
      new Request("http://t/api/v2/marketplace/templates?kind=workflow") as unknown as NextRequest,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      templates: Array<{ id: string }>;
      scope: { isDevFallback: boolean };
    };
    expect(body.templates).toHaveLength(1);
    expect(body.scope.isDevFallback).toBe(false);
    expect(storeMock.listTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "workflow" }),
    );
  });
});

describe("POST /api/v2/marketplace/templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si body invalide", async () => {
    const { POST } = await import("@/app/api/v2/marketplace/templates/route");
    const req = new Request("http://t/api/v2/marketplace/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "workflow" }), // pas de title/payload
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("400 si JSON malformé", async () => {
    const { POST } = await import("@/app/api/v2/marketplace/templates/route");
    const req = new Request("http://t/api/v2/marketplace/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("201 quand publish réussit", async () => {
    storeMock.publishTemplate.mockResolvedValueOnce({
      id: "new-id",
      kind: "workflow",
      title: "Test",
      description: null,
      authorUserId: "00000000-0000-0000-0000-000000000001",
      authorTenantId: "tenant-1",
      authorDisplayName: null,
      tags: [],
      ratingAvg: 0,
      ratingCount: 0,
      cloneCount: 0,
      isFeatured: false,
      createdAt: "",
      updatedAt: "",
      payload: makeWorkflowPayload(),
    });
    const { POST } = await import("@/app/api/v2/marketplace/templates/route");
    const req = new Request("http://t/api/v2/marketplace/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "workflow",
        title: "Test",
        payload: makeWorkflowPayload(),
      }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(201);
    expect(storeMock.publishTemplate).toHaveBeenCalledTimes(1);
  });

  it("500 quand publish retourne null", async () => {
    storeMock.publishTemplate.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v2/marketplace/templates/route");
    const req = new Request("http://t/api/v2/marketplace/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "persona",
        title: "X",
        payload: { name: "P" },
      }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/v2/marketplace/templates/[id]/clone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 si template inconnu", async () => {
    storeMock.cloneTemplate.mockResolvedValueOnce({
      ok: false,
      error: "template_not_found",
    });
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/clone/route"
    );
    const res = await POST(
      new Request("http://t/x", { method: "POST" }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("201 quand clone OK", async () => {
    storeMock.cloneTemplate.mockResolvedValueOnce({
      ok: true,
      resourceId: "new-mission-id",
    });
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/clone/route"
    );
    const res = await POST(
      new Request("http://t/x", { method: "POST" }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "tpl-1" }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; resourceId: string };
    expect(body.ok).toBe(true);
    expect(body.resourceId).toBe("new-mission-id");
  });
});

describe("POST /api/v2/marketplace/templates/[id]/rate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si rating hors plage", async () => {
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/rate/route"
    );
    const req = new Request("http://t/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 7 }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 OK quand rate réussit", async () => {
    storeMock.rateTemplate.mockResolvedValueOnce(true);
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/rate/route"
    );
    const req = new Request("http://t/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, comment: "Top" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v2/marketplace/templates/[id]/report", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 si raison trop courte", async () => {
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/report/route"
    );
    const req = new Request("http://t/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "x" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("200 OK quand report réussit", async () => {
    storeMock.reportTemplate.mockResolvedValueOnce(true);
    const { POST } = await import(
      "@/app/api/v2/marketplace/templates/[id]/report/route"
    );
    const req = new Request("http://t/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Contenu illégal" }),
    });
    const res = await POST(req as unknown as NextRequest, {
      params: Promise.resolve({ id: "tpl-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v2/marketplace/templates/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 quand template introuvable", async () => {
    storeMock.getTemplate.mockResolvedValueOnce(null);
    const { GET } = await import(
      "@/app/api/v2/marketplace/templates/[id]/route"
    );
    const res = await GET(
      new Request("http://t/x") as unknown as NextRequest,
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("200 avec template + ratings", async () => {
    storeMock.getTemplate.mockResolvedValueOnce({
      id: "tpl-1",
      kind: "persona",
      title: "P",
      description: null,
      payload: { name: "P" },
      authorUserId: "u",
      authorTenantId: "t",
      authorDisplayName: null,
      tags: [],
      ratingAvg: 4.5,
      ratingCount: 2,
      cloneCount: 3,
      isFeatured: false,
      createdAt: "",
      updatedAt: "",
    });
    storeMock.listRatings.mockResolvedValueOnce([
      {
        templateId: "tpl-1",
        userId: "u2",
        rating: 5,
        comment: "Top",
        createdAt: "",
      },
    ]);
    const { GET } = await import(
      "@/app/api/v2/marketplace/templates/[id]/route"
    );
    const res = await GET(
      new Request("http://t/x") as unknown as NextRequest,
      { params: Promise.resolve({ id: "tpl-1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      template: { title: string };
      ratings: Array<{ rating: number }>;
    };
    expect(body.template.title).toBe("P");
    expect(body.ratings).toHaveLength(1);
  });
});

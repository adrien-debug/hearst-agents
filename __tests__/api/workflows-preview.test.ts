/**
 * POST /api/v2/workflows/preview — dry-run d'un graphe.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "u1",
      tenantId: "t1",
      workspaceId: "w1",
      isDevFallback: false,
    },
    error: null,
  })),
}));

import { POST } from "@/app/api/v2/workflows/preview/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/v2/workflows/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/workflows/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne 400 si pas de graph", async () => {
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("graph_required");
  });

  it("retourne 400 si graph invalide", async () => {
    const res = await POST(
      makeRequest({
        graph: { nodes: [], edges: [], startNodeId: "" },
      }) as never,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_graph");
  });

  it("exécute un graphe simple en preview", async () => {
    const res = await POST(
      makeRequest({
        graph: {
          startNodeId: "t",
          nodes: [
            { id: "t", kind: "trigger", label: "T", config: {} },
            { id: "out", kind: "output", label: "Out", config: { payload: {} } },
          ],
          edges: [{ id: "e1", source: "t", target: "out" }],
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result.status).toBe("completed");
    expect(data.result.visitedCount).toBe(2);
    expect(Array.isArray(data.events)).toBe(true);
  });
});

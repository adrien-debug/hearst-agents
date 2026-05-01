/**
 * Mission Memory routes (vague 9) — auth + ownership + happy path.
 *
 * Couvre :
 *  - GET/POST /api/v2/missions/[id]/messages
 *  - GET     /api/v2/missions/[id]/context
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  getMission: vi.fn(),
  getScheduledMissions: vi.fn(),
  appendMissionMessage: vi.fn(),
  listMissionMessages: vi.fn(),
  getMissionContext: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: mocks.requireScope,
}));

vi.mock("@/lib/engine/runtime/missions/store", () => ({
  getMission: mocks.getMission,
}));

vi.mock("@/lib/engine/runtime/state/adapter", () => ({
  getScheduledMissions: mocks.getScheduledMissions,
}));

vi.mock("@/lib/memory/mission-context", () => ({
  appendMissionMessage: mocks.appendMissionMessage,
  listMissionMessages: mocks.listMissionMessages,
  getMissionContext: mocks.getMissionContext,
}));

const SCOPE = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  isDevFallback: false,
};

const MISSION_ID = "11111111-1111-1111-1111-111111111111";

function makeReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : null,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

describe("/api/v2/missions/[id]/messages", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue({ scope: SCOPE, error: null });
  });

  it("GET — 401 si pas authentifié", async () => {
    mocks.requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const { GET } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/messages"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("GET — 404 si mission inexistante", async () => {
    mocks.getMission.mockReturnValue(undefined);
    mocks.getScheduledMissions.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/messages"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET — 404 si mission appartient à un autre user", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: "user-other",
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    const { GET } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/messages"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET — happy path retourne messages", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: SCOPE.userId,
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    mocks.listMissionMessages.mockResolvedValue([
      {
        id: "msg-1",
        missionId: MISSION_ID,
        userId: SCOPE.userId,
        role: "user",
        content: "où en est-on ?",
        runId: null,
        createdAt: 1000,
        metadata: {},
      },
    ]);
    const { GET } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/messages?limit=10"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("où en est-on ?");
    expect(mocks.listMissionMessages).toHaveBeenCalledWith({
      missionId: MISSION_ID,
      userId: SCOPE.userId,
      limit: 10,
      before: undefined,
    });
  });

  it("POST — 400 si content vide", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: SCOPE.userId,
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    const { POST } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await POST(
      makeReq("http://localhost/api/v2/missions/x/messages", { content: "  " }),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("POST — 400 si JSON invalide", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: SCOPE.userId,
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    const { POST } = await import("@/app/api/v2/missions/[id]/messages/route");
    // Forge un NextRequest avec body non-JSON
    const req = new NextRequest(
      new URL("http://localhost/api/v2/missions/x/messages"),
      {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ id: MISSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("POST — happy path persiste message user", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: SCOPE.userId,
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    mocks.appendMissionMessage.mockResolvedValue({
      id: "msg-new",
      missionId: MISSION_ID,
      userId: SCOPE.userId,
      role: "user",
      content: "test",
      runId: null,
      createdAt: 2000,
      metadata: {},
    });
    const { POST } = await import("@/app/api/v2/missions/[id]/messages/route");
    const res = await POST(
      makeReq("http://localhost/api/v2/missions/x/messages", { content: "test" }),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message.content).toBe("test");
    expect(mocks.appendMissionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: MISSION_ID,
        userId: SCOPE.userId,
        role: "user",
        content: "test",
      }),
    );
  });

  it("POST — role assistant côté client est forcé à user", async () => {
    mocks.getMission.mockReturnValue({
      id: MISSION_ID,
      userId: SCOPE.userId,
      input: "x",
      name: "x",
      schedule: "",
      enabled: true,
    });
    mocks.appendMissionMessage.mockResolvedValue({
      id: "msg-new",
      missionId: MISSION_ID,
      userId: SCOPE.userId,
      role: "user",
      content: "test",
      runId: null,
      createdAt: 2000,
      metadata: {},
    });
    const { POST } = await import("@/app/api/v2/missions/[id]/messages/route");
    await POST(
      makeReq("http://localhost/api/v2/missions/x/messages", {
        content: "test",
        role: "assistant", // tentative bypass
      }),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    const callArgs = mocks.appendMissionMessage.mock.calls[0][0] as {
      role: string;
    };
    // Le caller ne peut pas écrire des assistant messages
    expect(callArgs.role).toBe("user");
  });
});

describe("/api/v2/missions/[id]/context", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue({ scope: SCOPE, error: null });
  });

  it("GET — 401 si pas authentifié", async () => {
    mocks.requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const { GET } = await import("@/app/api/v2/missions/[id]/context/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/context"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(401);
  });

  it("GET — 404 si mission inconnue", async () => {
    mocks.getMission.mockReturnValue(undefined);
    mocks.getScheduledMissions.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v2/missions/[id]/context/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/context"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET — passe summary preload depuis Supabase", async () => {
    mocks.getMission.mockReturnValue(undefined);
    mocks.getScheduledMissions.mockResolvedValue([
      {
        id: MISSION_ID,
        userId: SCOPE.userId,
        tenantId: SCOPE.tenantId,
        workspaceId: SCOPE.workspaceId,
        name: "Acme follow-up",
        input: "Suivi deal Acme",
        schedule: "0 9 * * *",
        enabled: true,
        createdAt: 0,
        contextSummary: "**Objectif.** Closer Acme.",
        contextSummaryUpdatedAt: 1234,
      },
    ]);
    mocks.getMissionContext.mockResolvedValue({
      summary: "**Objectif.** Closer Acme.",
      summaryUpdatedAt: 1234,
      recentMessages: [],
      retrievedMemory: "",
      kgSnippet: null,
      generatedAt: Date.now(),
    });

    const { GET } = await import("@/app/api/v2/missions/[id]/context/route");
    const res = await GET(
      makeReq("http://localhost/api/v2/missions/x/context"),
      { params: Promise.resolve({ id: MISSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect(mocks.getMissionContext).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: MISSION_ID,
        userId: SCOPE.userId,
        tenantId: SCOPE.tenantId,
        missionInput: "Suivi deal Acme",
        preloadedSummary: "**Objectif.** Closer Acme.",
        preloadedSummaryUpdatedAt: 1234,
      }),
    );
  });
});

/**
 * kg-ingest-pipeline — extraction + persistence d'un turn de conversation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { extractEntities, upsertNode, upsertEdge } = vi.hoisted(() => ({
  extractEntities: vi.fn(),
  upsertNode: vi.fn(),
  upsertEdge: vi.fn(),
}));

vi.mock("@/lib/memory/kg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, extractEntities, upsertNode, upsertEdge };
});

import {
  ingestConversationTurn,
  fireAndForgetIngestTurn,
} from "@/lib/memory/kg-ingest-pipeline";

describe("ingestConversationTurn", () => {
  beforeEach(() => {
    extractEntities.mockReset();
    upsertNode.mockReset();
    upsertEdge.mockReset();
  });

  it("texte vide → skipped, n'appelle pas l'extraction", async () => {
    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "",
      assistantReply: "",
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("empty_text");
    expect(extractEntities).not.toHaveBeenCalled();
  });

  it("extraction vide → skipped, n'écrit rien", async () => {
    extractEntities.mockResolvedValue({ entities: [], relations: [] });
    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "salut",
      assistantReply: "ok",
    });
    expect(res.skipped).toBe(true);
    expect(upsertNode).not.toHaveBeenCalled();
  });

  it("entités extraites → upsertNode appelé pour chaque", async () => {
    extractEntities.mockResolvedValue({
      entities: [
        { type: "person", label: "Adrien", properties: {} },
        { type: "company", label: "ACME", properties: {} },
      ],
      relations: [
        { source_label: "Adrien", target_label: "ACME", type: "works_at", weight: 1.0 },
      ],
    });
    upsertNode
      .mockResolvedValueOnce("node-1")
      .mockResolvedValueOnce("node-2");
    upsertEdge.mockResolvedValue(undefined);

    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "Adrien travaille chez ACME",
      assistantReply: "Compris.",
    });

    expect(res.entitiesCreated).toBe(2);
    expect(res.edgesCreated).toBe(1);
    expect(upsertNode).toHaveBeenCalledTimes(2);
    expect(upsertEdge).toHaveBeenCalledTimes(1);
    const edgeCall = upsertEdge.mock.calls[0][1] as {
      source_id: string;
      target_id: string;
      type: string;
    };
    expect(edgeCall.source_id).toBe("node-1");
    expect(edgeCall.target_id).toBe("node-2");
    expect(edgeCall.type).toBe("works_at");
  });

  it("upsertNode throw → skip ce node, continue les autres", async () => {
    extractEntities.mockResolvedValue({
      entities: [
        { type: "person", label: "A", properties: {} },
        { type: "person", label: "B", properties: {} },
      ],
      relations: [],
    });
    upsertNode
      .mockRejectedValueOnce(new Error("DB down"))
      .mockResolvedValueOnce("node-2");

    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "A et B",
      assistantReply: "ok",
    });
    expect(res.entitiesCreated).toBe(1);
    expect(res.skipped).toBe(false);
  });

  it("relation référençant un label non créé → skip silencieux", async () => {
    extractEntities.mockResolvedValue({
      entities: [{ type: "person", label: "Adrien", properties: {} }],
      relations: [
        { source_label: "Adrien", target_label: "Inconnu", type: "knows", weight: 1.0 },
      ],
    });
    upsertNode.mockResolvedValueOnce("n1");

    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "x",
      assistantReply: "y",
    });
    expect(res.entitiesCreated).toBe(1);
    expect(res.edgesCreated).toBe(0);
    expect(upsertEdge).not.toHaveBeenCalled();
  });

  it("extractEntities throw → skipped sans crash", async () => {
    extractEntities.mockRejectedValue(new Error("anthropic down"));
    const res = await ingestConversationTurn({
      userId: "u1",
      tenantId: "t1",
      userMessage: "x",
      assistantReply: "y",
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("extraction_failed");
  });
});

describe("fireAndForgetIngestTurn", () => {
  beforeEach(() => {
    extractEntities.mockReset();
    upsertNode.mockReset();
    upsertEdge.mockReset();
  });

  it("ne propage pas les erreurs (fire-and-forget)", () => {
    extractEntities.mockRejectedValue(new Error("boom"));
    expect(() =>
      fireAndForgetIngestTurn({
        userId: "u1",
        tenantId: "t1",
        userMessage: "x",
        assistantReply: "y",
      }),
    ).not.toThrow();
  });
});

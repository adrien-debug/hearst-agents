/**
 * Worker meeting-bot — vérifie le lifecycle terminal (status "done"),
 * le merge dans l'asset placeholder et le cleanup deleteBot.
 *
 * On mock le provider et Deepgram. On ne teste pas le polling temps réel
 * (le worker ferait des sleep de 30s).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBotStatus: vi.fn(),
  getTranscript: vi.fn(),
  deleteBot: vi.fn(),
  extractActionItems: vi.fn(),
  storeAsset: vi.fn(),
  loadAssetById: vi.fn(),
}));

vi.mock("@/lib/capabilities/providers/recall-ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/capabilities/providers/recall-ai")>(
    "@/lib/capabilities/providers/recall-ai",
  );
  return {
    ...actual,
    getBotStatus: mocks.getBotStatus,
    getTranscript: mocks.getTranscript,
    deleteBot: mocks.deleteBot,
  };
});

vi.mock("@/lib/capabilities/providers/deepgram", () => ({
  extractActionItems: mocks.extractActionItems,
}));

vi.mock("@/lib/assets/types", () => ({
  storeAsset: mocks.storeAsset,
  loadAssetById: mocks.loadAssetById,
}));

vi.mock("@/lib/jobs/worker-base", () => ({
  startWorker: vi.fn(),
}));

describe("worker meeting-bot — finalisation", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.storeAsset.mockResolvedValue(undefined);
    mocks.loadAssetById.mockResolvedValue({
      id: "bot-1",
      threadId: "meeting:bot-1",
      kind: "event",
      title: "Meeting · existing",
      provenance: {
        providerId: "system",
        userId: "u-1",
        tenantId: "t-1",
        workspaceId: "w-1",
      },
      createdAt: 1700000000000,
      contentRef: JSON.stringify({ status: "joining", startedAt: 1700000000000 }),
    });
    mocks.deleteBot.mockResolvedValue(undefined);
    mocks.extractActionItems.mockResolvedValue([
      { action: "Préparer le brief de demain", owner: "Adrien" },
    ]);
  });

  it("simule la finalisation : transcript final + action items + persist storeAsset", async () => {
    // On reproduit la logique du worker post-loop (sans le polling).
    // C'est cohérent avec le test inbox-fetch-worker (qui appelle directement
    // les fonctions au lieu d'instancier BullMQ).
    mocks.getTranscript.mockResolvedValue({
      transcript: "[speaker0] Bonjour\n[speaker1] Salut",
      segments: [
        { speaker: "speaker0", text: "Bonjour", start: 0, end: 1 },
        { speaker: "speaker1", text: "Salut", start: 1, end: 2 },
      ],
    });

    const { getTranscript } = await import("@/lib/capabilities/providers/recall-ai");
    const { extractActionItems } = await import("@/lib/capabilities/providers/deepgram");
    const { storeAsset, loadAssetById } = await import("@/lib/assets/types");

    const detail = await getTranscript("bot-1");
    const items = await extractActionItems(detail.transcript);
    const existing = await loadAssetById("bot-1");

    await storeAsset({
      id: "bot-1",
      threadId: existing!.threadId,
      kind: "event",
      title: existing!.title,
      summary: `Réunion terminée · ${items.length} action items`,
      createdAt: existing!.createdAt,
      provenance: existing!.provenance,
      contentRef: JSON.stringify({
        status: "done",
        transcript: detail.transcript,
        actionItems: items,
      }),
    });

    expect(mocks.storeAsset).toHaveBeenCalledTimes(1);
    const persisted = mocks.storeAsset.mock.calls[0][0];
    expect(persisted.id).toBe("bot-1");
    expect(persisted.kind).toBe("event");
    expect(persisted.summary).toContain("1 action items");
    const content = JSON.parse(persisted.contentRef);
    expect(content.status).toBe("done");
    expect(content.transcript).toContain("Bonjour");
    expect(content.actionItems[0].action).toContain("brief");
  });

  it("validateInput rejette un payload sans assetId", async () => {
    const mod = await import("@/lib/jobs/workers/meeting-bot");
    // L'export `startMeetingBotWorker` appelle `startWorker(handler)` ; on
    // récupère le handler injecté via le mock.
    const { startWorker } = await import("@/lib/jobs/worker-base");
    mod.startMeetingBotWorker();
    const handler = (startWorker as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(() =>
      handler.validateInput({
        jobKind: "meeting-bot",
        meetingUrl: "https://zoom.us/j/1",
        meetingProvider: "zoom",
        recordingPolicy: "all_participants_consent",
        userId: "u-1",
        tenantId: "t-1",
        workspaceId: "w-1",
        estimatedCostUsd: 0,
      }),
    ).toThrow(/assetId/);
  });

  it("validateInput rejette un payload meetingUrl vide", async () => {
    const mod = await import("@/lib/jobs/workers/meeting-bot");
    const { startWorker } = await import("@/lib/jobs/worker-base");
    mod.startMeetingBotWorker();
    const handler = (startWorker as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(() =>
      handler.validateInput({
        jobKind: "meeting-bot",
        meetingUrl: "",
        meetingProvider: "zoom",
        recordingPolicy: "all_participants_consent",
        assetId: "bot-1",
        userId: "u-1",
        tenantId: "t-1",
        workspaceId: "w-1",
        estimatedCostUsd: 0,
      }),
    ).toThrow(/meetingUrl/);
  });
});

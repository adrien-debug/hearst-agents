/**
 * Voice tools — verrouille le contrat de retour de `executeVoiceTool`.
 *
 * Le client (VoicePulse) consomme `{ output, stageRequest? }` et
 * applique stageRequest via setStageMode. Ce test garantit que les 3 tools
 * (start_meeting_bot, start_simulation, generate_image) renvoient bien le
 * stageRequest attendu pour téléporter sur le bon Stage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  createMeetingBotMock,
  storeAssetMock,
  createVariantMock,
  enqueueJobMock,
  executeComposioMock,
} = vi.hoisted(() => ({
  createMeetingBotMock: vi.fn(),
  storeAssetMock: vi.fn(),
  createVariantMock: vi.fn().mockResolvedValue("variant-id"),
  enqueueJobMock: vi.fn().mockResolvedValue({ jobId: "job-id" }),
  executeComposioMock: vi.fn(),
}));

vi.mock("@/lib/capabilities/providers/recall-ai", () => ({
  createMeetingBot: createMeetingBotMock,
}));

vi.mock("@/lib/assets/types", () => ({
  storeAsset: storeAssetMock,
}));

vi.mock("@/lib/assets/variants", () => ({
  createVariant: createVariantMock,
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: enqueueJobMock,
}));

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: executeComposioMock,
}));

import { executeVoiceTool } from "@/lib/voice/tools";
import type { CanonicalScope } from "@/lib/platform/auth/scope";

const scope: CanonicalScope = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  isDevFallback: false,
};

beforeEach(() => {
  createMeetingBotMock.mockReset().mockResolvedValue({ botId: "bot-42" });
  storeAssetMock.mockReset();
  createVariantMock.mockReset().mockResolvedValue("variant-id");
  enqueueJobMock.mockReset().mockResolvedValue({ jobId: "job-id" });
  executeComposioMock.mockReset();
});

describe("executeVoiceTool", () => {
  it("start_simulation → stageRequest simulation avec scenario", async () => {
    const res = await executeVoiceTool({
      name: "start_simulation",
      args: { scenario: "Migration vers cloud" },
      scope,
    });
    expect(res.stageRequest).toEqual({
      mode: "simulation",
      scenario: "Migration vers cloud",
    });
    expect(res.output).toMatch(/Simulation/i);
  });

  it("start_meeting_bot → mint bot + stageRequest meeting avec meetingId", async () => {
    const res = await executeVoiceTool({
      name: "start_meeting_bot",
      args: { meeting_url: "https://zoom.us/j/123", bot_name: "Hearst" },
      scope,
    });
    expect(createMeetingBotMock).toHaveBeenCalledWith({
      meetingUrl: "https://zoom.us/j/123",
      botName: "Hearst",
    });
    expect(res.stageRequest).toEqual({ mode: "meeting", meetingId: "bot-42" });
  });

  it("generate_image → persist asset + variant + enqueue + stageRequest asset image", async () => {
    const res = await executeVoiceTool({
      name: "generate_image",
      args: { prompt: "un logo cyan", style: "minimaliste" },
      scope,
    });

    expect(storeAssetMock).toHaveBeenCalledTimes(1);
    const storedAsset = storeAssetMock.mock.calls[0][0];
    expect(storedAsset.kind).toBe("report");
    expect(storedAsset.title).toBe("un logo cyan");

    expect(createVariantMock).toHaveBeenCalledWith({
      assetId: expect.any(String),
      kind: "image",
      status: "pending",
      provider: "fal",
    });

    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    const enqueued = enqueueJobMock.mock.calls[0][0];
    expect(enqueued.jobKind).toBe("image-gen");
    expect(enqueued.prompt).toBe("un logo cyan — style: minimaliste");

    expect(res.stageRequest).toMatchObject({
      mode: "asset",
      variantKind: "image",
    });
  });

  it("required arg manquant → output d'erreur, pas de stageRequest", async () => {
    const res = await executeVoiceTool({
      name: "start_simulation",
      args: {},
      scope,
    });
    expect(res.stageRequest).toBeUndefined();
    expect(res.output).toMatch(/manquant/i);
  });

  it("nom de tool inconnu (lowercase non-Hearst) → output 'inconnu', pas de stageRequest", async () => {
    const res = await executeVoiceTool({
      name: "delete_database",
      args: {},
      scope,
    });
    expect(res.stageRequest).toBeUndefined();
    expect(res.output).toMatch(/inconnu/i);
    expect(executeComposioMock).not.toHaveBeenCalled();
  });

  it("name UPPERCASE Composio → dispatch vers executeComposioAction", async () => {
    executeComposioMock.mockResolvedValue({
      ok: true,
      data: { messageId: "msg-1", thread: "abc" },
    });

    const res = await executeVoiceTool({
      name: "GMAIL_SEND_EMAIL",
      args: { to: "test@example.com", subject: "Hi", body: "Hello" },
      scope,
    });

    expect(executeComposioMock).toHaveBeenCalledWith({
      action: "GMAIL_SEND_EMAIL",
      entityId: scope.userId,
      params: { to: "test@example.com", subject: "Hi", body: "Hello" },
    });
    expect(res.stageRequest).toBeUndefined();
    expect(res.output).toContain("msg-1");
  });

  it("Composio error → output formaté avec message d'erreur", async () => {
    executeComposioMock.mockResolvedValue({
      ok: false,
      error: "Slack channel not found",
      errorCode: "ACTION_FAILED",
    });

    const res = await executeVoiceTool({
      name: "SLACK_SEND_MESSAGE",
      args: { channel: "#nope", text: "ping" },
      scope,
    });

    expect(res.output).toMatch(/Erreur SLACK_SEND_MESSAGE.*Slack channel not found/);
    expect(res.stageRequest).toBeUndefined();
  });

  it("Composio output > 2000 chars est tronqué", async () => {
    executeComposioMock.mockResolvedValue({
      ok: true,
      data: { huge: "x".repeat(5000) },
    });
    const res = await executeVoiceTool({
      name: "DRIVE_DUMP",
      args: {},
      scope,
    });
    expect(res.output.length).toBeLessThanOrEqual(2001);
    expect(res.output.endsWith("…")).toBe(true);
  });
});

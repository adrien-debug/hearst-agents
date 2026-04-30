/**
 * Provider Recall.ai — vérifie createMeetingBot, getBotStatus, validateMeetingUrl,
 * detectMeetingProvider et verifyWebhookSignature.
 *
 * On mock global.fetch et on inspecte les appels (URL, headers, body).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  createMeetingBot,
  getBotStatus,
  detectMeetingProvider,
  validateMeetingUrl,
  verifyWebhookSignature,
  isRecallAiConfigured,
  RecallAiUnavailableError,
} from "@/lib/capabilities/providers/recall-ai";

const ORIGINAL_KEY = process.env.RECALL_API_KEY;
const ORIGINAL_SECRET = process.env.RECALL_WEBHOOK_SECRET;
const ORIGINAL_BASE = process.env.RECALL_API_BASE;

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.spyOn(global, "fetch").mockImplementation(impl as never);
}

describe("Recall.ai provider", () => {
  beforeEach(() => {
    process.env.RECALL_API_KEY = "rk-test-1";
    delete process.env.RECALL_WEBHOOK_SECRET;
    delete process.env.RECALL_API_BASE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.RECALL_API_KEY;
    else process.env.RECALL_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_SECRET === undefined) delete process.env.RECALL_WEBHOOK_SECRET;
    else process.env.RECALL_WEBHOOK_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_BASE === undefined) delete process.env.RECALL_API_BASE;
    else process.env.RECALL_API_BASE = ORIGINAL_BASE;
  });

  it("isRecallAiConfigured reflète la présence de la clé", () => {
    expect(isRecallAiConfigured()).toBe(true);
    delete process.env.RECALL_API_KEY;
    expect(isRecallAiConfigured()).toBe(false);
  });

  it("createMeetingBot throw RecallAiUnavailableError sans clé", async () => {
    delete process.env.RECALL_API_KEY;
    await expect(
      createMeetingBot({ meetingUrl: "https://meet.google.com/abc" }),
    ).rejects.toBeInstanceOf(RecallAiUnavailableError);
  });

  it("createMeetingBot POST /bot avec Authorization Token + recording_config Deepgram", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ id: "bot-123", status: "joining" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await createMeetingBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      botName: "Hearst Test",
      language: "en",
    });

    expect(result.botId).toBe("bot-123");
    expect(result.status).toBe("joining");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/bot");
    const headers = calls[0].init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Token rk-test-1");
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body.meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(body.bot_name).toBe("Hearst Test");
    expect(body.recording_config.transcript.provider.deepgram.language).toBe("en");
  });

  it("createMeetingBot throw avec status non-2xx", async () => {
    mockFetch(async () => new Response("bad request", { status: 400 }));
    await expect(
      createMeetingBot({ meetingUrl: "https://zoom.us/j/123" }),
    ).rejects.toThrow(/createBot failed 400/);
  });

  it("getBotStatus map status_changes -> latest code si status absent", async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          status_changes: [
            { code: "joining_call", created_at: "..." },
            { code: "in_call_recording", created_at: "..." },
          ],
          video_url: "https://cdn.recall.ai/video.mp4",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const status = await getBotStatus("bot-9");
    expect(status.status).toBe("in_call_recording");
    expect(status.videoUrl).toBe("https://cdn.recall.ai/video.mp4");
  });

  it("detectMeetingProvider reconnait zoom/meet/teams", () => {
    expect(detectMeetingProvider("https://zoom.us/j/12345")).toBe("zoom");
    expect(detectMeetingProvider("https://meet.google.com/abc-defg-hij")).toBe("google_meet");
    expect(detectMeetingProvider("https://teams.microsoft.com/l/meetup-join/x")).toBe("teams");
    expect(detectMeetingProvider("https://example.com/foo")).toBe("unknown");
  });

  it("validateMeetingUrl rejette URLs vides, mal formées et providers inconnus", () => {
    expect(validateMeetingUrl("")).toEqual({ ok: false, reason: "empty" });
    expect(validateMeetingUrl("pas-une-url")).toEqual({ ok: false, reason: "invalid_url" });
    expect(validateMeetingUrl("ftp://zoom.us/j/1")).toEqual({
      ok: false,
      reason: "invalid_protocol",
    });
    expect(validateMeetingUrl("https://example.com/x")).toEqual({
      ok: false,
      reason: "unsupported_provider",
    });
    expect(validateMeetingUrl("https://meet.google.com/abc-defg-hij")).toEqual({ ok: true });
  });

  it("verifyWebhookSignature retourne valid:false reason:no_secret quand le secret manque", () => {
    const verdict = verifyWebhookSignature({
      rawBody: "{}",
      signature: "anything",
    });
    // Plus d'auto-accept côté provider — la route tranche selon NODE_ENV
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("no_secret");
  });

  it("verifyWebhookSignature valide une signature HMAC sha256 correcte", () => {
    process.env.RECALL_WEBHOOK_SECRET = "secret-prod";
    const body = JSON.stringify({ event: "bot.in_call_recording" });
    const sig = createHmac("sha256", "secret-prod").update(body).digest("hex");
    const verdict = verifyWebhookSignature({ rawBody: body, signature: sig });
    expect(verdict.valid).toBe(true);
  });

  it("verifyWebhookSignature rejette une signature invalide", () => {
    process.env.RECALL_WEBHOOK_SECRET = "secret-prod";
    const verdict = verifyWebhookSignature({
      rawBody: "{}",
      signature: "deadbeef".repeat(8),
    });
    expect(verdict.valid).toBe(false);
  });
});

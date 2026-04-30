/**
 * POST /api/v2/meetings/webhook — vérifie :
 *  - 200 sans secret en dev (NODE_ENV=development) — accept silently + warn
 *  - 503 sans secret en prod (NODE_ENV=production) — webhook désactivé
 *  - 403 avec mauvaise signature quand secret set
 *  - 200 + cache update quand signature valide
 *  - 400 quand body JSON invalide (mais signature OK)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

import { POST } from "@/app/api/v2/meetings/webhook/route";
import {
  clearWebhookCache,
  getLatestWebhookEvent,
} from "@/lib/meetings/webhook-cache";

function makeReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v2/meetings/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("POST /api/v2/meetings/webhook", () => {
  let originalSecret: string | undefined;
  let originalNodeEnv: string | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalSecret = process.env.RECALL_WEBHOOK_SECRET;
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.RECALL_WEBHOOK_SECRET;
    clearWebhookCache();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.RECALL_WEBHOOK_SECRET;
    else process.env.RECALL_WEBHOOK_SECRET = originalSecret;
    // @ts-expect-error — restaurer NODE_ENV brutalement
    process.env.NODE_ENV = originalNodeEnv;
    clearWebhookCache();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("200 sans secret en dev — accept + warn + cache update", async () => {
    // @ts-expect-error — NODE_ENV est readonly côté NodeJS.ProcessEnv
    process.env.NODE_ENV = "development";
    const body = JSON.stringify({
      event: "bot.in_call_recording",
      data: { bot_id: "bot-1", status: { code: "in_call_recording" } },
    });
    const res = await POST(makeReq(body) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.botId).toBe("bot-1");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("RECALL_WEBHOOK_SECRET absent"),
    );
    const cached = getLatestWebhookEvent("bot-1");
    expect(cached?.event).toBe("bot.in_call_recording");
  });

  it("503 sans secret en production — webhook désactivé", async () => {
    // @ts-expect-error — NODE_ENV est readonly côté NodeJS.ProcessEnv
    process.env.NODE_ENV = "production";
    const body = JSON.stringify({
      event: "bot.done",
      data: { bot_id: "bot-prod" },
    });
    const res = await POST(makeReq(body) as never);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("webhook_secret_not_configured");
    expect(errorSpy).toHaveBeenCalled();
    // Cache PAS mis à jour
    expect(getLatestWebhookEvent("bot-prod")).toBeNull();
  });

  it("403 quand secret set mais signature invalide", async () => {
    process.env.RECALL_WEBHOOK_SECRET = "secret-prod";
    const body = JSON.stringify({ event: "bot.done", data: { bot_id: "bot-2" } });
    const res = await POST(
      makeReq(body, { "x-recall-signature": "deadbeef".repeat(8) }) as never,
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("invalid_signature");
  });

  it("200 quand signature HMAC valide (NODE_ENV=production)", async () => {
    // @ts-expect-error — NODE_ENV est readonly côté NodeJS.ProcessEnv
    process.env.NODE_ENV = "production";
    process.env.RECALL_WEBHOOK_SECRET = "secret-prod";
    const body = JSON.stringify({
      event: "bot.done",
      data: { bot_id: "bot-3", recording: { url: "https://cdn.recall.ai/x.mp4" } },
    });
    const sig = createHmac("sha256", "secret-prod").update(body).digest("hex");
    const res = await POST(
      makeReq(body, { "x-recall-signature": sig }) as never,
    );
    expect(res.status).toBe(200);
    const cached = getLatestWebhookEvent("bot-3");
    expect(cached?.recordingUrl).toBe("https://cdn.recall.ai/x.mp4");
  });

  it("400 si JSON invalide (en dev sans secret, on traverse jusqu'au parse)", async () => {
    // @ts-expect-error — NODE_ENV est readonly côté NodeJS.ProcessEnv
    process.env.NODE_ENV = "development";
    const res = await POST(makeReq("not json") as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_json");
  });
});

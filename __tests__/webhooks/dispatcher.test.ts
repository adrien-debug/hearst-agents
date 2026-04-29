/**
 * Tests du dispatcher webhooks.
 *
 * Couvre :
 * - Signature HMAC-SHA256 correcte
 * - Pas de signature si pas de secret
 * - Retry sur 5xx (max 2 tentatives après la première)
 * - Pas de retry sur 4xx
 * - Pas de retry si succès
 * - Timeout / réseau KO → retry
 * - Fire-and-forget : dispatchWebhookEvent ne throw jamais
 * - last_status mis à jour après dispatch
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { signPayload, __testInternals, dispatchWebhookEventAsync } from "@/lib/webhooks/dispatcher";
import type { CustomWebhook } from "@/lib/webhooks/types";

// ── Mock Supabase (pour updateWebhookStatus) ─────────────────

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            contains: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

// ── Mock store pour getActiveWebhooksForEvent ─────────────────

vi.mock("@/lib/webhooks/store", () => ({
  getActiveWebhooksForEvent: vi.fn(),
  updateWebhookStatus: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────

const TENANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WEBHOOK_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SECRET = "super-secret-hmac-key";
const TEST_URL = "https://example.com/hook";

function makeWebhook(overrides: Partial<CustomWebhook> = {}): CustomWebhook {
  return {
    id: WEBHOOK_ID,
    tenantId: TENANT,
    name: "Test Webhook",
    url: TEST_URL,
    events: ["report.generated"],
    active: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests signPayload ─────────────────────────────────────────

describe("signPayload", () => {
  it("calcule un HMAC-SHA256 correct avec préfixe sha256=", () => {
    const body = JSON.stringify({ event: "report.generated", tenantId: TENANT });
    const signature = signPayload(SECRET, body);

    // Vérification indépendante
    const expected = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    expect(signature).toBe(expected);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("produit des signatures différentes pour des bodies différents", () => {
    const sig1 = signPayload(SECRET, "body1");
    const sig2 = signPayload(SECRET, "body2");
    expect(sig1).not.toBe(sig2);
  });

  it("produit des signatures différentes pour des secrets différents", () => {
    const body = "same body";
    const sig1 = signPayload("secret1", body);
    const sig2 = signPayload("secret2", body);
    expect(sig1).not.toBe(sig2);
  });
});

// ── Tests postWithRetry ────────────────────────────────────────

const { postWithRetry } = __testInternals;

describe("postWithRetry", () => {
  it("retourne ok:true sur succès 200 sans retry", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return new Response(null, { status: 200 });
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(callCount).toBe(1);
  });

  it("retry sur 500 (max 3 appels total)", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return new Response(null, { status: 500 });
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(callCount).toBe(3); // 1 initial + 2 retries
  });

  it("pas de retry sur 400", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return new Response(null, { status: 400 });
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(callCount).toBe(1); // pas de retry
  });

  it("pas de retry sur 422", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return new Response(null, { status: 422 });
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(callCount).toBe(1);
  });

  it("retry sur erreur réseau (fetch throw)", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      throw new Error("Network error");
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
    expect(callCount).toBe(3); // 1 + 2 retries
  });

  it("succès au 2e essai après 500", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      if (callCount === 1) return new Response(null, { status: 500 });
      return new Response(null, { status: 200 });
    };

    const result = await postWithRetry(TEST_URL, "{}", {}, fetcher as typeof fetch);
    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it("envoie le header x-hearst-signature si présent", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string, init: RequestInit = {}) => {
      capturedHeaders = init.headers as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    const body = JSON.stringify({ event: "test" });
    const sig = signPayload(SECRET, body);
    await postWithRetry(TEST_URL, body, { "x-hearst-signature": sig }, fetcher as typeof fetch);

    expect(capturedHeaders["x-hearst-signature"]).toBe(sig);
  });
});

// ── Tests dispatchWebhookEventAsync ───────────────────────────

describe("dispatchWebhookEventAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatche un webhook actif et retourne ok:true", async () => {
    const fetcher = async () => new Response(null, { status: 200 });
    const webhook = makeWebhook({ secret: SECRET });

    const result = await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      { reportId: "r1" },
      fetcher as typeof fetch,
      [webhook],
    );

    expect(result.dispatched).toBe(1);
    expect(result.results[0]?.ok).toBe(true);
  });

  it("ajoute la signature HMAC si secret configuré", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string, init: RequestInit = {}) => {
      capturedHeaders = (init.headers ?? {}) as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    const webhook = makeWebhook({ secret: SECRET });
    await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      {},
      fetcher as typeof fetch,
      [webhook],
    );

    expect(capturedHeaders["x-hearst-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("n'ajoute pas de signature si pas de secret", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetcher = async (_url: string, init: RequestInit = {}) => {
      capturedHeaders = (init.headers ?? {}) as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    const webhook = makeWebhook({ secret: undefined });
    await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      {},
      fetcher as typeof fetch,
      [webhook],
    );

    expect(capturedHeaders["x-hearst-signature"]).toBeUndefined();
  });

  it("retourne dispatched:0 si aucun webhook", async () => {
    const fetcher = async () => new Response(null, { status: 200 });

    const result = await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      {},
      fetcher as typeof fetch,
      [],
    );

    expect(result.dispatched).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("retourne ok:false sur échec 500 persistant", async () => {
    const fetcher = async () => new Response(null, { status: 500 });
    const webhook = makeWebhook();

    const result = await dispatchWebhookEventAsync(
      "mission.completed",
      TENANT,
      {},
      fetcher as typeof fetch,
      [webhook],
    );

    expect(result.results[0]?.ok).toBe(false);
  });

  it("appelle updateWebhookStatus avec 'success' sur 200", async () => {
    const { updateWebhookStatus } = await import("@/lib/webhooks/store");
    const fetcher = async () => new Response(null, { status: 200 });
    const webhook = makeWebhook();

    await dispatchWebhookEventAsync(
      "asset.created",
      TENANT,
      {},
      fetcher as typeof fetch,
      [webhook],
    );

    expect(updateWebhookStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: WEBHOOK_ID, status: "success" }),
    );
  });

  it("appelle updateWebhookStatus avec 'failed' sur 500", async () => {
    const { updateWebhookStatus } = await import("@/lib/webhooks/store");
    const fetcher = async () => new Response(null, { status: 500 });
    const webhook = makeWebhook();

    await dispatchWebhookEventAsync(
      "mission.failed",
      TENANT,
      {},
      fetcher as typeof fetch,
      [webhook],
    );

    expect(updateWebhookStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: WEBHOOK_ID, status: "failed" }),
    );
  });
});

// ── Tests fire-and-forget (dispatchWebhookEvent) ──────────────

describe("dispatchWebhookEvent (fire-and-forget)", () => {
  it("ne throw pas même si la DB est inaccessible", async () => {
    const { dispatchWebhookEvent } = await import("@/lib/webhooks/dispatcher");
    const { getActiveWebhooksForEvent } = await import("@/lib/webhooks/store");

    vi.mocked(getActiveWebhooksForEvent).mockRejectedValueOnce(new Error("DB down"));

    expect(() => {
      dispatchWebhookEvent("report.generated", TENANT, {});
    }).not.toThrow();

    // Attendre que la Promise interne se résolve
    await new Promise((r) => setTimeout(r, 50));
  });

  it("ne throw pas même si fetch échoue", async () => {
    const { dispatchWebhookEvent } = await import("@/lib/webhooks/dispatcher");
    const { getActiveWebhooksForEvent } = await import("@/lib/webhooks/store");

    vi.mocked(getActiveWebhooksForEvent).mockResolvedValueOnce([makeWebhook()]);

    expect(() => {
      dispatchWebhookEvent("report.generated", TENANT, {});
    }).not.toThrow();

    await new Promise((r) => setTimeout(r, 100));
  });
});

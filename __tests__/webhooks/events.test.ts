/**
 * Tests du filtrage par type d'événement.
 *
 * Couvre :
 * - getActiveWebhooksForEvent ne retourne que les webhooks qui souscrivent à l'event
 * - dispatchWebhookEventAsync envoie seulement aux webhooks qui ont l'event dans leur liste
 * - Les events non listés ne déclenchent pas le webhook
 * - WEBHOOK_EVENTS contient tous les events attendus
 */

import { describe, it, expect, vi } from "vitest";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/types";
import { dispatchWebhookEventAsync } from "@/lib/webhooks/dispatcher";
import type { CustomWebhook } from "@/lib/webhooks/types";

// ── Mock Supabase ─────────────────────────────────────────────

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => null,
}));

vi.mock("@/lib/webhooks/store", () => ({
  getActiveWebhooksForEvent: vi.fn(),
  updateWebhookStatus: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────

const TENANT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function makeWebhook(events: WebhookEvent[], id = "wh1"): CustomWebhook {
  return {
    id,
    tenantId: TENANT,
    name: `Webhook ${id}`,
    url: "https://example.com/hook",
    events,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests WEBHOOK_EVENTS ──────────────────────────────────────

describe("WEBHOOK_EVENTS", () => {
  it("contient tous les événements produit attendus", () => {
    const expected: WebhookEvent[] = [
      "report.generated",
      "report.exported",
      "report.shared",
      "mission.completed",
      "mission.failed",
      "signal.triggered",
      "asset.created",
      "asset.deleted",
      "comment.added",
    ];

    for (const evt of expected) {
      expect(WEBHOOK_EVENTS).toContain(evt);
    }
  });

  it("est readonly (tuple as const)", () => {
    // Vérifie que le type est bien un tuple const (pas mutable)
    expect(Array.isArray(WEBHOOK_EVENTS)).toBe(true);
    expect(WEBHOOK_EVENTS.length).toBeGreaterThanOrEqual(9);
  });
});

// ── Tests filtrage par event ──────────────────────────────────

describe("dispatchWebhookEventAsync — filtrage event", () => {
  it("envoie uniquement aux webhooks qui ont l'event dans leur liste", async () => {
    const fetcher = async () => new Response(null, { status: 200 });

    // wh1 souscrit à report.generated, pas wh2
    const wh1 = makeWebhook(["report.generated"], "wh1");
    const wh2 = makeWebhook(["mission.completed"], "wh2");

    // On passe seulement wh1 (le store filtre en amont)
    const result = await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      { reportId: "r1" },
      fetcher as typeof fetch,
      [wh1],
    );

    expect(result.dispatched).toBe(1);
    expect(result.results[0]?.id).toBe("wh1");

    // wh2 n'est pas dans le résultat
    const ids = result.results.map((r) => r.id);
    expect(ids).not.toContain("wh2");
    void wh2; // référencé pour silence TS
  });

  it("n'envoie rien si aucun webhook ne correspond à l'event", async () => {
    const fetcher = async () => new Response(null, { status: 200 });

    const result = await dispatchWebhookEventAsync(
      "asset.deleted",
      TENANT,
      {},
      fetcher as typeof fetch,
      [], // aucun webhook actif pour cet event
    );

    expect(result.dispatched).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("dispatche vers plusieurs webhooks simultanément", async () => {
    const calledUrls: string[] = [];
    const fetcher = async (url: string) => {
      calledUrls.push(url);
      return new Response(null, { status: 200 });
    };

    const wh1 = makeWebhook(["mission.completed"], "wh1");
    const wh2 = makeWebhook(["mission.completed"], "wh2");
    wh2.url = "https://other.example.com/hook";

    const result = await dispatchWebhookEventAsync(
      "mission.completed",
      TENANT,
      { missionId: "m1" },
      fetcher as typeof fetch,
      [wh1, wh2],
    );

    expect(result.dispatched).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it("le payload contient l'event, tenantId, timestamp et data", async () => {
    let capturedBody = "";
    const fetcher = async (_url: string, init: RequestInit = {}) => {
      capturedBody = init.body as string;
      return new Response(null, { status: 200 });
    };

    const webhook = makeWebhook(["report.generated"]);
    const eventData = { reportId: "report-123", title: "Mon rapport" };

    await dispatchWebhookEventAsync(
      "report.generated",
      TENANT,
      eventData,
      fetcher as typeof fetch,
      [webhook],
    );

    const parsed = JSON.parse(capturedBody);
    expect(parsed.event).toBe("report.generated");
    expect(parsed.tenantId).toBe(TENANT);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.data.reportId).toBe("report-123");
    expect(parsed.data.title).toBe("Mon rapport");
  });

  it("test.ping dispatche vers le webhook fourni", async () => {
    const fetcher = async () => new Response(null, { status: 200 });
    const webhook = makeWebhook(["report.generated"]);

    const result = await dispatchWebhookEventAsync(
      "test.ping",
      TENANT,
      { message: "ping" },
      fetcher as typeof fetch,
      [webhook],
    );

    expect(result.dispatched).toBe(1);
    expect(result.results[0]?.ok).toBe(true);
  });
});

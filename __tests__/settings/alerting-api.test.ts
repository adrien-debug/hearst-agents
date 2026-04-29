/**
 * Tests unitaires — Routes API settings/alerting.
 *
 * On teste la logique de validation Zod, le round-trip GET/PUT, et
 * l'endpoint test — sans appel réseau réel (Supabase + fetch mockés).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { alertingPreferencesSchema } from "@/lib/notifications/schema";
import type { AlertingPreferences } from "@/lib/notifications/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PREFS: AlertingPreferences = {
  webhooks: [
    { url: "https://hook.example.com/abc", signalTypes: ["mrr_drop", "*"] },
  ],
  email: { recipients: ["alice@example.com"], signalTypes: ["*"] },
  slack: { webhookUrl: "https://hooks.slack.com/services/T/B/x", signalTypes: ["*"] },
};

// ── Tests Zod schema ──────────────────────────────────────────────────────────

describe("alertingPreferencesSchema — validation PUT", () => {
  it("accepte des préférences valides complètes", () => {
    const r = alertingPreferencesSchema.safeParse(VALID_PREFS);
    expect(r.success).toBe(true);
  });

  it("rejette une URL webhook invalide", () => {
    const r = alertingPreferencesSchema.safeParse({
      ...VALID_PREFS,
      webhooks: [{ url: "not-a-url", signalTypes: ["mrr_drop"] }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("url"))).toBe(true);
    }
  });

  it("rejette une URL webhook http (non-https) pour Slack", () => {
    const r = alertingPreferencesSchema.safeParse({
      slack: { webhookUrl: "http://hooks.slack.com/x", signalTypes: ["*"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejette un signalType inexistant", () => {
    const r = alertingPreferencesSchema.safeParse({
      webhooks: [{ url: "https://h.example/", signalTypes: ["signal_fictif"] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejette email avec recipients vide", () => {
    const r = alertingPreferencesSchema.safeParse({
      email: { recipients: [], signalTypes: ["*"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejette email avec adresse invalide", () => {
    const r = alertingPreferencesSchema.safeParse({
      email: { recipients: ["pas-un-email"], signalTypes: ["*"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejette plus de 10 webhooks", () => {
    const r = alertingPreferencesSchema.safeParse({
      webhooks: Array.from({ length: 11 }, (_, i) => ({
        url: `https://hook${i}.example.com/`,
        signalTypes: ["*"],
      })),
    });
    expect(r.success).toBe(false);
  });

  it("accepte wildcardString '*' dans signalTypes", () => {
    const r = alertingPreferencesSchema.safeParse({
      webhooks: [{ url: "https://h.example/", signalTypes: ["*"] }],
    });
    expect(r.success).toBe(true);
  });

  it("accepte un objet vide → defaults (webhooks: [])", () => {
    const r = alertingPreferencesSchema.parse({});
    expect(r.webhooks).toEqual([]);
    expect(r.email).toBeUndefined();
    expect(r.slack).toBeUndefined();
  });
});

// ── Tests round-trip save/load ────────────────────────────────────────────────

describe("loadAlertingPreferences / saveAlertingPreferences — round-trip", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("saveAlertingPreferences appelle setTenantSetting avec les données parsées", async () => {
    const mockSetTenantSetting = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/platform/settings", () => ({
      getTenantSetting: vi.fn().mockResolvedValue(VALID_PREFS),
      setTenantSetting: mockSetTenantSetting,
    }));

    const { saveAlertingPreferences } = await import("@/lib/notifications/alert-dispatcher");
    const fakeDb = {} as Parameters<typeof saveAlertingPreferences>[0];

    await saveAlertingPreferences(fakeDb, "tenant-1", VALID_PREFS, "user-1");

    expect(mockSetTenantSetting).toHaveBeenCalledOnce();
    const [, tenantId, key] = mockSetTenantSetting.mock.calls[0] as [unknown, string, string];
    expect(tenantId).toBe("tenant-1");
    expect(key).toBe("alerting.preferences");
  });

  it("loadAlertingPreferences retourne DEFAULT_ALERTING_PREFERENCES si setting absent", async () => {
    vi.doMock("@/lib/platform/settings", () => ({
      getTenantSetting: vi.fn().mockResolvedValue(null),
      setTenantSetting: vi.fn(),
    }));

    const { loadAlertingPreferences } = await import("@/lib/notifications/alert-dispatcher");
    const { DEFAULT_ALERTING_PREFERENCES } = await import("@/lib/notifications/schema");

    const fakeDb = {} as Parameters<typeof loadAlertingPreferences>[0];
    const prefs = await loadAlertingPreferences(fakeDb, "tenant-1");

    expect(prefs).toEqual(DEFAULT_ALERTING_PREFERENCES);
  });

  it("loadAlertingPreferences retourne DEFAULT si la valeur stockée est invalide", async () => {
    vi.doMock("@/lib/platform/settings", () => ({
      getTenantSetting: vi.fn().mockResolvedValue({ webhooks: "pas-un-array" }),
      setTenantSetting: vi.fn(),
    }));

    const { loadAlertingPreferences } = await import("@/lib/notifications/alert-dispatcher");
    const { DEFAULT_ALERTING_PREFERENCES } = await import("@/lib/notifications/schema");

    const fakeDb = {} as Parameters<typeof loadAlertingPreferences>[0];
    const prefs = await loadAlertingPreferences(fakeDb, "tenant-1");

    expect(prefs).toEqual(DEFAULT_ALERTING_PREFERENCES);
  });
});

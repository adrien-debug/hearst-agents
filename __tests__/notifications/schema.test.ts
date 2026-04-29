/**
 * Tests du schéma Zod des préférences alerting.
 */

import { describe, expect, it } from "vitest";
import {
  alertingPreferencesSchema,
  parseAlertingPreferences,
  DEFAULT_ALERTING_PREFERENCES,
} from "@/lib/notifications/schema";

describe("alertingPreferencesSchema", () => {
  it("accepte un objet vide → defaults", () => {
    const r = alertingPreferencesSchema.parse({});
    expect(r.webhooks).toEqual([]);
    expect(r.email).toBeUndefined();
    expect(r.slack).toBeUndefined();
  });

  it("accepte une config webhook complète", () => {
    const r = alertingPreferencesSchema.parse({
      webhooks: [
        { url: "https://hook.example/x", signalTypes: ["mrr_drop", "*"] },
      ],
    });
    expect(r.webhooks).toHaveLength(1);
  });

  it("rejette une URL webhook invalide", () => {
    const r = alertingPreferencesSchema.safeParse({
      webhooks: [{ url: "not-a-url", signalTypes: ["mrr_drop"] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejette un signalType inconnu (ni dans BUSINESS_SIGNAL_TYPES ni '*')", () => {
    const r = alertingPreferencesSchema.safeParse({
      webhooks: [{ url: "https://h.example/", signalTypes: ["totally_made_up"] }],
    });
    expect(r.success).toBe(false);
  });

  it("accepte la config email", () => {
    const r = alertingPreferencesSchema.parse({
      email: { recipients: ["a@b.com"], signalTypes: ["sla_breach"] },
    });
    expect(r.email?.recipients).toEqual(["a@b.com"]);
  });

  it("rejette une config email avec recipients vides", () => {
    const r = alertingPreferencesSchema.safeParse({
      email: { recipients: [], signalTypes: ["sla_breach"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejette une URL slack non-https", () => {
    const r = alertingPreferencesSchema.safeParse({
      slack: { webhookUrl: "http://hooks.slack.com/x", signalTypes: ["*"] },
    });
    expect(r.success).toBe(false);
  });
});

describe("parseAlertingPreferences", () => {
  it("retourne defaults sur null/undefined", () => {
    expect(parseAlertingPreferences(null)).toEqual(DEFAULT_ALERTING_PREFERENCES);
    expect(parseAlertingPreferences(undefined)).toEqual(
      DEFAULT_ALERTING_PREFERENCES,
    );
  });

  it("retourne defaults sur shape invalide (au lieu de throw)", () => {
    const r = parseAlertingPreferences({ webhooks: "not-an-array" });
    expect(r).toEqual(DEFAULT_ALERTING_PREFERENCES);
  });
});

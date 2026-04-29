/**
 * Tests d'intégration — dispatcher + notifications in-app.
 *
 * Vérifie que `createNotification` est appelé après un signal critical/warning
 * et pas pour un signal info.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { dispatchAlerts } from "@/lib/notifications/alert-dispatcher";
import type { AlertingPreferences } from "@/lib/notifications/schema";
import type { ThrottleStore } from "@/lib/notifications/throttle";
import type { BusinessSignal } from "@/lib/reports/signals/extract";
import * as inApp from "@/lib/notifications/in-app";

// ── Helpers ────────────────────────────────────────────────────────────────

const TENANT = "33333333-3333-4333-8333-333333333333";
const REPORT = { id: "44444444-4444-4444-8444-444444444444", title: "Founder Cockpit" };

function makeSignal(
  type: BusinessSignal["type"],
  severity: BusinessSignal["severity"],
): BusinessSignal {
  return { type, severity, message: `${type} détecté`, blockId: "kpi" };
}

function buildStore(): ThrottleStore {
  const map = new Map<string, number>();
  return {
    getLast: (k) => map.get(k) ?? null,
    markEmitted: (k, t) => { map.set(k, t); },
  };
}

const noop_prefs: AlertingPreferences = { webhooks: [] };

// Mock Supabase client minimal (juste besoin d'un objet avec .from())
function buildMockDb() {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => ({
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({
                data: {
                  id: crypto.randomUUID(),
                  tenant_id: TENANT,
                  user_id: null,
                  kind: "signal",
                  severity: "critical",
                  title: "test",
                  body: null,
                  meta: null,
                  read_at: null,
                  created_at: new Date().toISOString(),
                },
                error: null,
              }).then(resolve),
          }),
        }),
      }),
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("dispatcher → createNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appelle createNotification pour un signal critical", async () => {
    const spy = vi.spyOn(inApp, "createNotification").mockResolvedValue(null);
    const db = buildMockDb();

    await dispatchAlerts({
      tenantId: TENANT,
      signals: [makeSignal("mrr_drop", "critical")],
      report: REPORT,
      severityFloor: "critical",
      preferences: noop_prefs,
      throttleStore: buildStore(),
      db: db as never,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({
      tenantId: TENANT,
      kind: "signal",
      severity: "critical",
      meta: expect.objectContaining({ signal_type: "mrr_drop" }),
    });
  });

  it("appelle createNotification pour un signal warning (quand floor=warning)", async () => {
    const spy = vi.spyOn(inApp, "createNotification").mockResolvedValue(null);
    const db = buildMockDb();

    await dispatchAlerts({
      tenantId: TENANT,
      signals: [makeSignal("pipeline_thin", "warning")],
      report: REPORT,
      severityFloor: "warning",
      preferences: noop_prefs,
      throttleStore: buildStore(),
      db: db as never,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({ severity: "warning" });
  });

  it("n'appelle PAS createNotification pour un signal info", async () => {
    const spy = vi.spyOn(inApp, "createNotification").mockResolvedValue(null);
    const db = buildMockDb();

    // Forcer severity floor à info pour que le signal passe
    await dispatchAlerts({
      tenantId: TENANT,
      signals: [makeSignal("mrr_spike", "info")],
      report: REPORT,
      severityFloor: "info",
      preferences: noop_prefs,
      throttleStore: buildStore(),
      db: db as never,
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("n'appelle PAS createNotification si db non fourni", async () => {
    const spy = vi.spyOn(inApp, "createNotification").mockResolvedValue(null);

    await dispatchAlerts({
      tenantId: TENANT,
      signals: [makeSignal("mrr_drop", "critical")],
      report: REPORT,
      severityFloor: "critical",
      preferences: noop_prefs,
      throttleStore: buildStore(),
      // db non fourni intentionnellement
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("appelle createNotification pour chaque signal distinct non throttlé", async () => {
    const spy = vi.spyOn(inApp, "createNotification").mockResolvedValue(null);
    const db = buildMockDb();

    await dispatchAlerts({
      tenantId: TENANT,
      signals: [
        makeSignal("mrr_drop", "critical"),
        makeSignal("runway_risk", "critical"),
        makeSignal("sla_breach", "critical"),
      ],
      report: REPORT,
      severityFloor: "critical",
      preferences: noop_prefs,
      throttleStore: buildStore(),
      db: db as never,
    });

    expect(spy).toHaveBeenCalledTimes(3);
  });
});

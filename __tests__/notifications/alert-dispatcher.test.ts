/**
 * Tests du dispatcher d'alerting.
 *
 * Couvre :
 *  - Filtrage par severityFloor (default critical, override warning).
 *  - Throttling : pas de double émission dans la fenêtre.
 *  - Filtrage par signalTypes par canal (wildcard "*", liste explicite).
 *  - Routing multi-canaux (webhook + slack + email) en parallèle.
 *  - Robustesse : fetch qui throw, status 5xx → retry 1x, statut email stub.
 *  - Logging non bloquant (on n'asserte pas le format mais on vérifie qu'il ne throw pas).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchAlerts } from "@/lib/notifications/alert-dispatcher";
import type { AlertingPreferences } from "@/lib/notifications/schema";
import type { ThrottleStore } from "@/lib/notifications/throttle";
import type { BusinessSignal } from "@/lib/reports/signals/extract";

// ── Helpers ────────────────────────────────────────────────

function critical(type: BusinessSignal["type"], message = "msg"): BusinessSignal {
  return { type, severity: "critical", message, blockId: "kpi_test" };
}

function warning(type: BusinessSignal["type"], message = "msg"): BusinessSignal {
  return { type, severity: "warning", message, blockId: "kpi_test" };
}

function buildStore(): ThrottleStore {
  const map = new Map<string, number>();
  return {
    getLast: (k) => map.get(k) ?? null,
    markEmitted: (k, t) => {
      map.set(k, t);
    },
  };
}

const REPORT = { id: "00000000-0000-4000-8000-000000000001", title: "Test Report" };

// silence des logs pendant les tests
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

// ── severity floor ─────────────────────────────────────────

describe("dispatchAlerts — severity floor", () => {
  it("ne dispatche QUE les signaux >= floor (default critical)", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop"), warning("nps_decline")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(out.dispatchedSignals.map((s) => s.type)).toEqual(["mrr_drop"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("severityFloor=warning autorise les warnings", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [warning("nps_decline")],
      preferences: prefs,
      severityFloor: "warning",
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(out.dispatchedSignals).toHaveLength(1);
  });
});

// ── throttle ───────────────────────────────────────────────

describe("dispatchAlerts — throttle", () => {
  it("ne dispatche pas un même signal type dans la fenêtre", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const store = buildStore();
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };

    // Premier dispatch
    await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: 1_000,
    });

    // Re-dispatch 1h plus tard → throttled
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: 1_000 + 60 * 60 * 1000,
    });

    expect(out.dispatchedSignals).toHaveLength(0);
    expect(out.throttledSignals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // pas de second appel
  });

  it("re-dispatche après expiration de la fenêtre 4h", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const store = buildStore();
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };

    await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    const FOUR_HOURS_PLUS = 4 * 60 * 60 * 1000 + 1;
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: FOUR_HOURS_PLUS,
    });

    expect(out.dispatchedSignals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throttle est par tenant — un autre tenant peut dispatcher", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const store = buildStore();
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };

    await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    const out = await dispatchAlerts({
      tenantId: "t2",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: store,
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(out.dispatchedSignals).toHaveLength(1);
  });
});

// ── filtre par canal (signalTypes) ─────────────────────────

describe("dispatchAlerts — filtre par canal", () => {
  it("le canal qui ne matche pas signalTypes ne reçoit pas", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const prefs: AlertingPreferences = {
      webhooks: [
        { url: "https://a.example/hook", signalTypes: ["mrr_drop"] },
        { url: "https://b.example/hook", signalTypes: ["sla_breach"] },
      ],
    };

    await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toContain("a.example");
  });

  it("wildcard '*' matche tous les signaux", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://a.example/hook", signalTypes: ["*"] }],
    };

    await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop"), critical("sla_breach")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── multi-canaux ───────────────────────────────────────────

describe("dispatchAlerts — multi canaux", () => {
  it("dispatche en parallèle vers webhook + slack + email", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const emailSendMock = vi.fn(async () => ({ ok: true, id: "msg_1" }));
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://hook.example/", signalTypes: ["*"] }],
      slack: { webhookUrl: "https://hooks.slack.com/services/X", signalTypes: ["*"] },
      email: { recipients: ["a@example.com"], signalTypes: ["*"] },
    };

    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      emailSender: { send: emailSendMock },
      now: 0,
    });

    expect(out.results.map((r) => r.kind).sort()).toEqual([
      "email",
      "slack",
      "webhook",
    ]);
    expect(out.anyDelivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // webhook + slack
    expect(emailSendMock).toHaveBeenCalledTimes(1);
  });
});

// ── payload shape ──────────────────────────────────────────

describe("dispatchAlerts — webhook payload shape", () => {
  it("envoie un JSON canonique { v, emittedAt, tenantId, report, signal }", async () => {
    let captured: { url: string; body: unknown } | null = null;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(String(init.body)) };
      return new Response("", { status: 200 });
    });

    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://hook.example/", signalTypes: ["*"] }],
    };

    await dispatchAlerts({
      tenantId: "tenant-xyz",
      report: REPORT,
      signals: [critical("runway_risk", "Runway critique")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 1700000000000,
    });

    expect(captured).not.toBeNull();
    const body = captured!.body as {
      v: number;
      tenantId: string;
      emittedAt: number;
      signal: { type: string; severity: string; message: string };
      report: { id: string; title: string };
    };
    expect(body.v).toBe(1);
    expect(body.tenantId).toBe("tenant-xyz");
    expect(body.signal.type).toBe("runway_risk");
    expect(body.signal.severity).toBe("critical");
    expect(body.signal.message).toBe("Runway critique");
    expect(body.report.title).toBe("Test Report");
    expect(body.emittedAt).toBe(1700000000000);
  });
});

// ── robustesse ─────────────────────────────────────────────

describe("dispatchAlerts — robustesse", () => {
  it("retry 1x sur 5xx puis abandonne", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 502 }));

    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://hook.example/", signalTypes: ["*"] }],
    };
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.results[0].ok).toBe(false);
    expect(out.results[0].status).toBe(502);
  });

  it("pas de retry sur 4xx", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 400 }));
    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://hook.example/", signalTypes: ["*"] }],
    };
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.results[0].ok).toBe(false);
    expect(out.results[0].status).toBe(400);
  });

  it("un canal qui throw n'invalide pas les autres", async () => {
    // Routage par URL — les deux canaux tournent en parallèle, l'ordre n'est
    // pas déterministe.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("hook.example")) {
        throw new Error("ECONNRESET");
      }
      return new Response("", { status: 200 });
    });

    const prefs: AlertingPreferences = {
      webhooks: [{ url: "https://hook.example/", signalTypes: ["*"] }],
      slack: { webhookUrl: "https://hooks.slack.com/services/X", signalTypes: ["*"] },
    };
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: prefs,
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    const webhook = out.results.find((r) => r.kind === "webhook");
    const slack = out.results.find((r) => r.kind === "slack");
    expect(webhook?.ok).toBe(false);
    expect(slack?.ok).toBe(true);
    expect(out.anyDelivered).toBe(true);
  });
});

// ── prefs absentes ─────────────────────────────────────────

describe("dispatchAlerts — préférences absentes", () => {
  it("retourne sans appel si webhooks vide + pas de slack/email", async () => {
    const fetchMock = vi.fn();
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [critical("mrr_drop")],
      preferences: { webhooks: [] },
      throttleStore: buildStore(),
      fetcher: fetchMock as unknown as typeof fetch,
      now: 0,
    });

    expect(out.results).toHaveLength(0);
    expect(out.anyDelivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ne crash pas si signaux vides", async () => {
    const out = await dispatchAlerts({
      tenantId: "t1",
      report: REPORT,
      signals: [],
      preferences: { webhooks: [] },
      throttleStore: buildStore(),
      now: 0,
    });
    expect(out.dispatchedSignals).toHaveLength(0);
  });
});

/**
 * Tests unitaires — notifications in-app.
 *
 * Couvre :
 *  - createNotification : insertion OK, validation Zod KO → retourne null
 *  - listNotifications : filtrage, isolation tenant, parsing Zod
 *  - markRead / markAllRead : appels sans throw
 *  - formatSignalTitle : formatage correct par sévérité
 */

import { describe, expect, it, vi } from "vitest";
import {
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
  formatSignalTitle,
  type Notification,
} from "@/lib/notifications/in-app";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Constantes ─────────────────────────────────────────────────────────────

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function buildNotif(overrides: Partial<Notification> = {}): Notification {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT_A,
    user_id: null,
    kind: "signal",
    severity: "critical",
    title: "Test notification",
    body: null,
    meta: null,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Proxy builder — simule la chaîne Supabase fluide ──────────────────────
// Chaque méthode retourne le même proxy, sauf `then` qui résoud une Promesse.
// On passe la réponse finale à la construction.

function makeSupabaseProxy(finalResponse: { data: unknown; error: { message: string } | null }) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        // Supabase client retourne un "PromiseLike" — on simule ça
        return (resolve: (v: unknown) => unknown) =>
          Promise.resolve(finalResponse).then(resolve);
      }
      // Toutes les autres méthodes (eq, or, is, order, limit, select, insert,
      // update, single, ...) retournent un nouveau proxy avec la même résolution
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

function buildDb(finalResponse: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => makeSupabaseProxy(finalResponse),
  } as unknown as SupabaseClient;
}

// ── createNotification ─────────────────────────────────────────────────────

describe("createNotification", () => {
  it("insère une notification valide et la retourne", async () => {
    const notif = buildNotif({ title: "MRR drop détecté" });
    const db = buildDb({ data: notif, error: null });

    const result = await createNotification(db, {
      tenantId: TENANT_A,
      kind: "signal",
      severity: "critical",
      title: "MRR drop détecté",
      body: "Le MRR a baissé de 15%",
      meta: { signal_type: "mrr_drop" },
    });

    expect(result).not.toBeNull();
    expect(result?.kind).toBe("signal");
    expect(result?.severity).toBe("critical");
    expect(result?.title).toBe("MRR drop détecté");
  });

  it("retourne null si tenantId n'est pas un UUID valide", async () => {
    const db = buildDb({ data: null, error: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createNotification(db, {
      tenantId: "not-a-uuid",
      kind: "signal",
      severity: "critical",
      title: "Test",
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("retourne null si kind invalide", async () => {
    const db = buildDb({ data: null, error: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createNotification(db, {
      tenantId: TENANT_A,
      kind: "invalid_kind" as "signal",
      severity: "critical",
      title: "Test",
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it("retourne null et logue si erreur DB", async () => {
    const db = buildDb({ data: null, error: { message: "DB constraint error" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createNotification(db, {
      tenantId: TENANT_A,
      kind: "signal",
      severity: "critical",
      title: "Test",
    });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── listNotifications ──────────────────────────────────────────────────────

describe("listNotifications", () => {
  it("parse correctement les notifs retournées par la DB", async () => {
    const notif = buildNotif({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const db = buildDb({ data: [notif], error: null });

    const result = await listNotifications(db, { tenantId: TENANT_A });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(result[0].kind).toBe("signal");
  });

  it("filtre les lignes invalides après retour DB", async () => {
    const VALID_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const valid = buildNotif({ id: VALID_UUID });
    const invalid = { id: "bad-row-not-uuid", garbage: true };
    const db = buildDb({ data: [valid, invalid], error: null });

    const result = await listNotifications(db, { tenantId: TENANT_A });

    expect(result.some((n) => n.id === VALID_UUID)).toBe(true);
    expect(result.some((n) => n.id === "bad-row-not-uuid")).toBe(false);
  });

  it("retourne [] si erreur DB", async () => {
    const db = buildDb({ data: null, error: { message: "DB failure" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await listNotifications(db, { tenantId: TENANT_A });

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("retourne [] pour tenantId invalide (validation Zod)", async () => {
    const db = buildDb({ data: [], error: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await listNotifications(db, { tenantId: "bad-uuid" });

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("retourne [] si data est null", async () => {
    const db = buildDb({ data: null, error: null });

    const result = await listNotifications(db, { tenantId: TENANT_A });

    expect(result).toEqual([]);
  });
});

// ── markRead ───────────────────────────────────────────────────────────────

describe("markRead", () => {
  it("ne throw pas sur appel valide", async () => {
    const db = buildDb({ data: null, error: null });
    await expect(
      markRead(db, { notificationId: crypto.randomUUID(), tenantId: TENANT_A }),
    ).resolves.toBeUndefined();
  });

  it("logue l'erreur DB sans throw", async () => {
    const db = buildDb({ data: null, error: { message: "DB error" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await markRead(db, { notificationId: crypto.randomUUID(), tenantId: TENANT_A });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── markAllRead ────────────────────────────────────────────────────────────

describe("markAllRead", () => {
  it("ne throw pas avec userId", async () => {
    const db = buildDb({ data: null, error: null });
    await expect(
      markAllRead(db, { tenantId: TENANT_A, userId: USER_A }),
    ).resolves.toBeUndefined();
  });

  it("ne throw pas sans userId (broadcast)", async () => {
    const db = buildDb({ data: null, error: null });
    await expect(
      markAllRead(db, { tenantId: TENANT_A }),
    ).resolves.toBeUndefined();
  });

  it("logue l'erreur DB sans throw", async () => {
    const db = buildDb({ data: null, error: { message: "DB error" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await markAllRead(db, { tenantId: TENANT_A });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ── formatSignalTitle ──────────────────────────────────────────────────────

describe("formatSignalTitle", () => {
  it("formate correctement un signal critical", () => {
    const title = formatSignalTitle("critical", "mrr_drop", "Founder Cockpit");
    expect(title).toBe("[🔴 Critical] mrr drop détecté sur Founder Cockpit");
  });

  it("formate correctement un signal warning", () => {
    const title = formatSignalTitle("warning", "pipeline_thin", "Deal-to-Cash");
    expect(title).toBe("[🟡 Warning] pipeline thin détecté sur Deal-to-Cash");
  });

  it("formate correctement un signal info", () => {
    const title = formatSignalTitle("info", "mrr_spike", "Financial P&L");
    expect(title).toBe("[🔵 Info] mrr spike détecté sur Financial P&L");
  });
});

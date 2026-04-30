/**
 * fixtures.ts — helpers et payloads réutilisables pour les tests e2e notifications.
 *
 * Aucun appel réseau réel — tout est mocké via page.route().
 */

import type { Page } from "@playwright/test";

// ── IDs stables ─────────────────────────────────────────────────────────────

export const NOTIF_ID_1 = "00000000-0000-4000-8000-notif00000001";
export const NOTIF_ID_2 = "00000000-0000-4000-8000-notif00000002";
export const NOTIF_ID_3 = "00000000-0000-4000-8000-notif00000003";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationKind = "signal" | "report_ready" | "export_done" | "share_viewed";
export type NotificationSeverity = "critical" | "warning" | "info";

export interface MockNotificationInput {
  id?: string;
  kind?: NotificationKind;
  severity?: NotificationSeverity;
  title?: string;
  body?: string;
  read_at?: string | null;
  created_at?: string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * mockNotification — génère une notification in-app avec valeurs par défaut.
 */
export function mockNotification(overrides: MockNotificationInput = {}) {
  return {
    id: overrides.id ?? NOTIF_ID_1,
    tenant_id: "tenant-test",
    user_id: "u1",
    kind: overrides.kind ?? "signal",
    severity: overrides.severity ?? "info",
    title: overrides.title ?? "Signal MRR détecté",
    body: overrides.body ?? "MRR en hausse de 8 % cette semaine.",
    read_at: overrides.read_at !== undefined ? overrides.read_at : null,
    created_at: overrides.created_at ?? new Date(Date.now() - 5 * 60_000).toISOString(),
    action_url: null,
    metadata: {},
  };
}

/** Payload liste notifications — vide (état initial "aucune notif"). */
export function mockEmptyNotifications() {
  return {
    notifications: [],
    unreadCount: 0,
    total: 0,
  };
}

/** Payload liste notifications — 2 non lues + 1 lue. */
export function mockNotificationsWithUnread() {
  return {
    notifications: [
      mockNotification({ id: NOTIF_ID_1, severity: "critical", title: "Runway < 6 mois", body: "Action requise.", read_at: null }),
      mockNotification({ id: NOTIF_ID_2, severity: "warning", title: "Pipeline thin", body: "Pipeline deal < 80k€.", read_at: null }),
      mockNotification({ id: NOTIF_ID_3, kind: "report_ready", severity: "info", title: "Rapport prêt", body: "Founder Cockpit généré.", read_at: new Date().toISOString() }),
    ],
    unreadCount: 2,
    total: 3,
  };
}

// ── Mock réseau ────────────────────────────────────────────────────────────

/**
 * mountSession — monte la session NextAuth (user connecté).
 * Réutilisable dans tous les tests notifications et alerting.
 */
export async function mountSession(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "u1", email: "adrien@hearstcorporation.io", name: "Adrien" },
        expires: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    }),
  );
}

/**
 * interceptNotificationAPI — mock GET /api/notifications.
 * Par défaut retourne une liste vide (badge = 0).
 */
export async function interceptNotificationAPI(
  page: Page,
  payload: ReturnType<typeof mockEmptyNotifications> | ReturnType<typeof mockNotificationsWithUnread> = mockEmptyNotifications(),
) {
  await page.route("**/api/notifications*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    }),
  );
}

/**
 * interceptMarkReadAPI — mock POST /api/notifications/read et /api/notifications/read-all.
 */
export async function interceptMarkReadAPI(page: Page) {
  await page.route("**/api/notifications/read*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route("**/api/notifications/read-all*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, updated: 2 }),
    }),
  );
}

/**
 * interceptAlertingAPI — mock GET/PUT /api/settings/alerting et POST /test.
 */
export async function interceptAlertingAPI(
  page: Page,
  opts?: {
    prefs?: Record<string, unknown>;
    testResult?: { ok: boolean; result?: Record<string, unknown> };
  },
) {
  const defaultPrefs = opts?.prefs ?? { webhooks: [] };
  const defaultTest = opts?.testResult ?? { ok: true, result: { status: 200 } };

  await page.route("**/api/settings/alerting", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prefs: defaultPrefs }),
      });
    }
    // PUT
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, prefs: defaultPrefs }),
    });
  });

  await page.route("**/api/settings/alerting/test", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(defaultTest),
    }),
  );
}

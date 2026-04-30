/**
 * notifications.spec.ts — Tests E2E Playwright pour la cloche de notification
 * et la page /notifications.
 *
 * Stratégie :
 *   - Tous les appels réseau sont mockés via page.route()
 *   - Pas d'appels Supabase réels
 *   - Le store Zustand (useNotificationsStore) se nourrit du mock GET /api/notifications
 *
 * Prérequis : serveur Next.js actif (localhost:9000 ou E2E_BASE_URL).
 * Les tests sont skippés si le serveur ne répond pas.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { NotificationsPage } from "./NotificationsPage";
import {
  mountSession,
  interceptNotificationAPI,
  interceptMarkReadAPI,
  mockEmptyNotifications,
  mockNotificationsWithUnread,
} from "./fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

/** Monte les mocks de base communs à tous les tests de cette suite. */
async function mountBaseSession(page: Parameters<typeof mountSession>[0]) {
  await mountSession(page);
  // Routes de fond (threads, right-panel) pour ne pas bloquer le rendu
  await page.route("**/api/v2/threads*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [] }) }),
  );
  await page.route("**/api/v2/right-panel*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ assets: [], missions: [], connections: [], reportSuggestions: [] }),
    }),
  );
}

// ── Cloche dans le header ─────────────────────────────────────────────────────

test.describe("NotificationBell — icône dans le header", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la cloche est visible dans le header", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await expect(np.bellButton).toBeVisible({ timeout: 8000 });
  });

  test("badge count = 0 quand aucune notification non lue (badge absent)", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await expect(np.bellButton).toBeVisible({ timeout: 8000 });

    // Sans notifs non lues, le badge (span aria-hidden avec le compte) ne doit pas être visible
    const badgeSpan = page.locator('button[aria-label*="Notifications"] span[aria-hidden]');
    await expect(badgeSpan).toHaveCount(0);

    // L'aria-label ne contient pas de compteur
    const label = await np.bellButton.getAttribute("aria-label");
    expect(label).not.toMatch(/\d+ non lue/);
  });

  test("badge affiche le count quand il y a des notifs non lues", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockNotificationsWithUnread());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await expect(np.bellButton).toBeVisible({ timeout: 8000 });

    // Attendre que le store se charge (polling)
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label*="Notifications"]');
        return btn?.getAttribute("aria-label")?.includes("non lue") ?? false;
      },
      { timeout: 10_000 },
    );

    const count = await np.getUnreadBadgeCount();
    expect(count).toBe(2);
  });
});

// ── Dropdown ──────────────────────────────────────────────────────────────────

test.describe("NotificationBell — dropdown", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("clic cloche → dropdown s'ouvre avec état vide", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await np.bellButton.waitFor({ state: "visible", timeout: 8000 });

    // Attendre que le store soit initialisé (au moins une requête /api/notifications)
    await page.waitForResponse("**/api/notifications*", { timeout: 8000 }).catch(() => null);

    await np.bellButton.click();
    await expect(np.dropdown).toBeVisible({ timeout: 5000 });

    // État vide
    await expect(np.emptyState).toBeVisible({ timeout: 3000 });
  });

  test("clic cloche → dropdown affiche les notifications", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockNotificationsWithUnread());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await np.bellButton.waitFor({ state: "visible", timeout: 8000 });

    // Attendre le chargement des notifs
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label*="Notifications"]');
        return btn?.getAttribute("aria-label")?.includes("non lue") ?? false;
      },
      { timeout: 10_000 },
    );

    await np.bellButton.click();
    await expect(np.dropdown).toBeVisible({ timeout: 5000 });

    // Doit afficher les lignes de notification
    await expect(page.getByText("Runway < 6 mois")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Pipeline thin")).toBeVisible({ timeout: 3000 });
  });

  test("bouton Tout marquer lu → badge revient à 0", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockNotificationsWithUnread());
    await interceptMarkReadAPI(page);

    await page.goto("/");

    const np = new NotificationsPage(page);
    await np.bellButton.waitFor({ state: "visible", timeout: 8000 });

    // Attendre que le store soit chargé avec les notifs non lues
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label*="Notifications"]');
        return btn?.getAttribute("aria-label")?.includes("non lue") ?? false;
      },
      { timeout: 10_000 },
    );

    // Ouvre le dropdown
    await np.bellButton.click();
    await expect(np.dropdown).toBeVisible({ timeout: 5000 });

    // Le bouton "Tout marquer lu" doit être visible
    await expect(np.markAllReadBtn).toBeVisible({ timeout: 3000 });

    // Après le clic, le store doit se mettre à jour (unreadCount → 0)
    // On mock la réponse suivante pour renvoyer 0 non lus
    await page.route("**/api/notifications*", (route) => {
      const url = route.request().url();
      if (url.includes("read-all")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, updated: 2 }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [], unreadCount: 0, total: 0 }),
      });
    });

    await np.markAllReadBtn.click();

    // Le badge doit disparaître (aria-label sans "(N non lues)")
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label*="Notifications"]');
        const label = btn?.getAttribute("aria-label") ?? "";
        return !label.includes("non lue");
      },
      { timeout: 8000 },
    );

    const countAfter = await np.getUnreadBadgeCount();
    expect(countAfter).toBe(0);
  });

  test("Escape ferme le dropdown", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await np.bellButton.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForResponse("**/api/notifications*", { timeout: 8000 }).catch(() => null);

    await np.bellButton.click();
    await expect(np.dropdown).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(np.dropdown).not.toBeVisible({ timeout: 3000 });
  });

  test("clic extérieur ferme le dropdown", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/");

    const np = new NotificationsPage(page);
    await np.bellButton.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForResponse("**/api/notifications*", { timeout: 8000 }).catch(() => null);

    await np.bellButton.click();
    await expect(np.dropdown).toBeVisible({ timeout: 5000 });

    // Clic en dehors du dropdown (haut gauche de la page, loin de la cloche)
    await page.mouse.click(10, 10);
    await expect(np.dropdown).not.toBeVisible({ timeout: 3000 });
  });
});

// ── Page /notifications ───────────────────────────────────────────────────────

test.describe("Page /notifications", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la page charge sans erreur 500", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    const errors: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/notifications") && res.status() >= 500) {
        errors.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("/notifications");

    // Pas d'erreur serveur
    expect(errors).toHaveLength(0);

    // Page accessible (pas de crash blanc)
    await expect(page.locator("body")).toBeVisible();
  });

  test("la page /notifications a un titre ou contenu visible", async ({ page }) => {
    await mountBaseSession(page);
    await interceptNotificationAPI(page, mockEmptyNotifications());

    await page.goto("/notifications");

    // La page doit avoir rendu quelque chose (pas de page blanche)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });
});

// ── Tests statiques (sans serveur) ───────────────────────────────────────────

test.describe("Fixtures notifications — validation statique", () => {
  test("mockEmptyNotifications retourne unreadCount = 0", () => {
    const payload = mockEmptyNotifications();
    expect(payload.unreadCount).toBe(0);
    expect(payload.notifications).toHaveLength(0);
  });

  test("mockNotificationsWithUnread retourne 2 non lues sur 3", () => {
    const payload = mockNotificationsWithUnread();
    expect(payload.unreadCount).toBe(2);
    expect(payload.notifications).toHaveLength(3);
    const unread = payload.notifications.filter((n) => n.read_at === null);
    expect(unread).toHaveLength(2);
  });
});

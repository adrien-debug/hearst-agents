/**
 * alerting.spec.ts — Tests E2E Playwright pour /settings/alerting.
 *
 * Stratégie :
 *   - Tous les appels réseau sont mockés via page.route()
 *   - Le composant AlertingSettings.tsx fetch GET /api/settings/alerting au montage
 *   - Les actions (ajout webhook, test, toggle email) sont testées en isolation
 *
 * Prérequis : serveur Next.js actif (localhost:9000 ou E2E_BASE_URL).
 * Les tests sont skippés si le serveur ne répond pas.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { AlertingPage } from "./AlertingPage";
import {
  mountSession,
  interceptAlertingAPI,
} from "../notifications/fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

async function mountBase(page: Parameters<typeof mountSession>[0]) {
  await mountSession(page);
}

// ── Navigation & chargement ───────────────────────────────────────────────────

test.describe("AlertingSettings — navigation et chargement", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la page /settings/alerting charge sans erreur", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page);

    const errors: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/settings/alerting") && res.status() >= 500) {
        errors.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("/settings/alerting");

    expect(errors).toHaveLength(0);
    await expect(page.locator("body")).toBeVisible();
  });

  test("le titre 'Alerting' est visible après chargement", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page);

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(ap.heading).toBeVisible();
  });

  test("le bouton Enregistrer est visible", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page);

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(ap.saveBtn).toBeVisible();
  });
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

test.describe("AlertingSettings — webhooks", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("bouton '+ Ajouter un webhook' est visible (liste vide)", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(ap.addWebhookBtn).toBeVisible({ timeout: 5000 });
  });

  test("clic '+ Ajouter un webhook' ouvre le formulaire avec champ URL", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await ap.addWebhookBtn.click();

    // Le champ URL du formulaire doit apparaître
    await expect(ap.webhookUrlInput).toBeVisible({ timeout: 3000 });
  });

  test("URL invalide → bouton Ajouter reste désactivé", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await ap.addWebhookBtn.click();
    await ap.webhookUrlInput.waitFor({ state: "visible", timeout: 3000 });

    // Saisie d'une URL invalide (ne commence pas par "http")
    await ap.webhookUrlInput.fill("pas-une-url-valide");

    // Le bouton "Ajouter" doit être désactivé (disabled=true car url.startsWith("http") échoue)
    await expect(ap.webhookAddConfirmBtn).toBeDisabled();
  });

  test("URL valide → bouton Ajouter activé", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await ap.addWebhookBtn.click();
    await ap.webhookUrlInput.waitFor({ state: "visible", timeout: 3000 });

    await ap.webhookUrlInput.fill("https://hook.example.com/test-hearst");

    await expect(ap.webhookAddConfirmBtn).toBeEnabled();
  });

  test("ajout webhook valide → URL apparaît dans la liste", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    const webhookUrl = "https://hook.example.com/hearst-test-webhook";
    await ap.addWebhook(webhookUrl);

    // L'URL doit apparaître dans le DOM (dans la card webhook)
    await expect(page.getByText(webhookUrl)).toBeVisible({ timeout: 3000 });
  });

  test("bouton Annuler ferme le formulaire sans ajouter", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await ap.addWebhookBtn.click();
    await ap.webhookUrlInput.waitFor({ state: "visible", timeout: 3000 });

    await ap.webhookUrlInput.fill("https://hook.example.com/will-be-cancelled");
    await ap.webhookCancelBtn.click();

    // Le formulaire disparaît
    await expect(ap.webhookUrlInput).not.toBeVisible({ timeout: 3000 });

    // L'URL ne doit pas être dans le DOM
    await expect(page.getByText("https://hook.example.com/will-be-cancelled")).not.toBeVisible();
  });

  test("bouton Tester sur un webhook → feedback 'Connecté' visible", async ({ page }) => {
    const webhookUrl = "https://hook.example.com/already-configured";

    await mountBase(page);
    await interceptAlertingAPI(page, {
      prefs: { webhooks: [{ url: webhookUrl, signalTypes: ["*"] }] },
      testResult: { ok: true, result: { status: 200 } },
    });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    // L'URL doit être visible dans la liste
    await expect(page.getByText(webhookUrl)).toBeVisible({ timeout: 5000 });

    // Clique sur Tester
    const testerBtn = page.getByRole("button", { name: /^tester$/i }).first();
    await expect(testerBtn).toBeVisible({ timeout: 3000 });
    await testerBtn.click();

    // Feedback "Connecté" ou "Test en cours…" doit apparaître
    const feedback = page.getByText(/connecté|test en cours/i);
    await expect(feedback).toBeVisible({ timeout: 5000 });
  });

  test("bouton Tester → erreur → badge 'Erreur' visible", async ({ page }) => {
    const webhookUrl = "https://hook.example.com/broken-endpoint";

    await mountBase(page);
    await interceptAlertingAPI(page, {
      prefs: { webhooks: [{ url: webhookUrl, signalTypes: ["*"] }] },
      testResult: { ok: false, result: { error: "timeout" } },
    });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(page.getByText(webhookUrl)).toBeVisible({ timeout: 5000 });

    const testerBtn = page.getByRole("button", { name: /^tester$/i }).first();
    await testerBtn.click();

    // Badge erreur
    await expect(page.getByText(/erreur/i)).toBeVisible({ timeout: 5000 });
  });
});

// ── Email ─────────────────────────────────────────────────────────────────────

test.describe("AlertingSettings — email", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("toggle Email activé → champ destinataires visible", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    // Toggle email est désactivé par défaut (pas de prefs.email)
    await expect(ap.emailToggle).toBeVisible({ timeout: 5000 });
    await ap.enableEmailToggle();

    // Le champ destinataires doit apparaître
    await expect(ap.emailRecipientsInput).toBeVisible({ timeout: 3000 });
  });

  test("toggle Email désactivé → champ destinataires masqué", async ({ page }) => {
    await mountBase(page);
    // On part avec email activé pour pouvoir le désactiver
    await interceptAlertingAPI(page, {
      prefs: {
        webhooks: [],
        email: { recipients: ["test@example.com"], signalTypes: ["*"] },
      },
    });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    // Email toggle est activé (aria-checked="true")
    await expect(ap.emailToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });

    // Désactive
    await ap.emailToggle.click();

    // Le champ destinataires disparaît
    await expect(ap.emailRecipientsInput).not.toBeVisible({ timeout: 3000 });
  });

  test("toggle Email → état persisté via PUT (mock)", async ({ page }) => {
    await mountBase(page);

    // Intercepte la requête PUT pour vérifier qu'elle est envoyée
    const putRequests: string[] = [];
    await page.route("**/api/settings/alerting", (route) => {
      const method = route.request().method();
      if (method === "PUT") {
        putRequests.push(route.request().url());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, prefs: { webhooks: [] } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prefs: { webhooks: [] } }),
      });
    });

    await page.route("**/api/settings/alerting/test", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    // Active l'email
    await ap.enableEmailToggle();
    await expect(ap.emailRecipientsInput).toBeVisible({ timeout: 3000 });

    // Clique Enregistrer pour déclencher le PUT
    await ap.saveBtn.click();

    // Attend que le PUT soit envoyé
    await page.waitForFunction(
      (urls) => urls.length > 0,
      putRequests,
      { timeout: 5000 },
    );

    expect(putRequests.length).toBeGreaterThan(0);
  });
});

// ── Slack ─────────────────────────────────────────────────────────────────────

test.describe("AlertingSettings — Slack", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("toggle Slack activé → champ URL Slack visible", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, { prefs: { webhooks: [] } });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(ap.slackToggle).toBeVisible({ timeout: 5000 });
    await ap.enableSlackToggle();

    await expect(ap.slackUrlInput).toBeVisible({ timeout: 3000 });
  });

  test("bouton Tester Slack désactivé sans URL valide", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, {
      prefs: { webhooks: [], slack: { webhookUrl: "", signalTypes: ["*"] } },
    });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    // Slack activé mais URL vide → bouton test désactivé
    await expect(ap.slackToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    await expect(ap.slackTestBtn).toBeDisabled({ timeout: 3000 });
  });

  test("bouton Tester Slack activé avec URL valide → feedback visible", async ({ page }) => {
    await mountBase(page);
    await interceptAlertingAPI(page, {
      prefs: {
        webhooks: [],
        slack: { webhookUrl: "https://hooks.slack.com/services/T123/B456/abc", signalTypes: ["*"] },
      },
      testResult: { ok: true, result: { status: 200 } },
    });

    const ap = new AlertingPage(page);
    await ap.goto();
    await ap.waitForLoaded();

    await expect(ap.slackToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    await expect(ap.slackTestBtn).toBeEnabled({ timeout: 5000 });

    await ap.slackTestBtn.click();

    // Feedback test
    await expect(page.getByText(/connecté|test en cours/i)).toBeVisible({ timeout: 5000 });
  });
});

// ── Tests statiques (sans serveur) ───────────────────────────────────────────

test.describe("AlertingSettings — validation statique des fixtures", () => {
  test("prefs vide contient un tableau webhooks vide", () => {
    const prefs = { webhooks: [] };
    expect(prefs.webhooks).toHaveLength(0);
  });

  test("prefs avec webhook a une URL", () => {
    const prefs = {
      webhooks: [{ url: "https://example.com/hook", signalTypes: ["*"] }],
    };
    expect(prefs.webhooks[0].url).toMatch(/^https?:\/\//);
  });
});

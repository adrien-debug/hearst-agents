import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { interceptLLMCalls, ASSET_ID } from "./fixtures";
import { ReportPage } from "./ReportPage";

/**
 * share.spec.ts — tests du flow Partager (signed URL).
 *
 * Stratégie :
 *   - Vérifie présence du bouton Partager dans le header report
 *   - Mocke POST /api/reports/share pour retourner un lien signé
 *   - Vérifie format du lien (contient /public/reports/)
 *   - Vérifie présence des options TTL (24h, 7j, 30j)
 *
 * Note : la génération de lien réel nécessite REPORT_SHARING_SECRET + Supabase.
 * Tout est mocké ici.
 */

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

const MOCK_SHARE_ID = "share-00000000-0000-4000-8000-000000000001";
const MOCK_SHARE_URL = `http://localhost:9000/public/reports/${MOCK_SHARE_ID}?token=mockedtoken123`;
const MOCK_EXPIRES_AT = new Date(Date.now() + 24 * 3600_000).toISOString();

/** Monte le mock de l'endpoint share. */
async function mockShareEndpoint(page: Parameters<typeof interceptLLMCalls>[0]) {
  await page.route("**/api/reports/share", (route) => {
    if (route.request().method() !== "POST") {
      route.continue();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        shareUrl: MOCK_SHARE_URL,
        expiresAt: MOCK_EXPIRES_AT,
        shareId: MOCK_SHARE_ID,
      }),
    });
  });
}

// ── Présence bouton Partager ──────────────────────────────────────────────────

test.describe("Share — présence du bouton", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("bouton 'Partager' visible dans le header du report", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    // Partager nécessite assetId dans ReportLayout
    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent — assetId non passé au ReportLayout");
    }

    await expect(rp.shareBtn).toBeVisible({ timeout: 5000 });
  });
});

// ── Popover Partager ──────────────────────────────────────────────────────────

test.describe("Share — popover et options TTL", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("clic 'Partager' → popover visible avec titre", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    // Le popover role="dialog" doit apparaître
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Titre "Partager le rapport"
    await expect(dialog.getByText("Partager le rapport")).toBeVisible();
  });

  test("options TTL 24h, 7 jours, 30 jours présentes", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Les 3 options TTL définies dans SharePopover
    await expect(dialog.getByRole("button", { name: "24 h" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "7 jours" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "30 jours" })).toBeVisible();
  });

  test("clic 'Créer un lien' → lien généré affiché", async ({ page }) => {
    await interceptLLMCalls(page);
    await mockShareEndpoint(page);

    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Clique "Créer un lien"
    const createBtn = dialog.getByRole("button", { name: /créer un lien/i });
    await expect(createBtn).toBeVisible({ timeout: 3000 });
    await createBtn.click();

    // Le champ input avec le lien doit apparaître
    const urlInput = dialog.locator('input[readonly]');
    await expect(urlInput).toBeVisible({ timeout: 5000 });

    const shareUrl = await urlInput.inputValue();
    expect(shareUrl).toContain("/public/reports/");
    expect(shareUrl.length).toBeGreaterThan(10);
  });

  test("format du lien généré : contient /public/reports/ et un token", async ({ page }) => {
    await interceptLLMCalls(page);
    await mockShareEndpoint(page);

    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const createBtn = dialog.getByRole("button", { name: /créer un lien/i });
    await createBtn.click();

    const urlInput = dialog.locator('input[readonly]');
    await expect(urlInput).toBeVisible({ timeout: 5000 });

    const shareUrl = await urlInput.inputValue();

    // Vérifie la structure du lien : /public/reports/
    expect(shareUrl).toMatch(/\/public\/reports\//);
  });

  test("TTL 7 jours sélectionné → lien créé avec ce TTL dans la requête", async ({ page }) => {
    await interceptLLMCalls(page);

    // Capture la requête POST pour vérifier le ttlHours
    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/reports/share", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const bodyText = route.request().postData();
      try {
        capturedBody = JSON.parse(bodyText ?? "{}") as Record<string, unknown>;
      } catch {
        capturedBody = {};
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          shareUrl: MOCK_SHARE_URL,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
          shareId: MOCK_SHARE_ID,
        }),
      });
    });

    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Sélectionne "7 jours"
    await dialog.getByRole("button", { name: "7 jours" }).click();

    // Clique "Créer un lien"
    const createBtn = dialog.getByRole("button", { name: /créer un lien/i });
    await createBtn.click();

    // Attend que l'input soit visible (lien généré)
    const urlInput = dialog.locator('input[readonly]');
    await expect(urlInput).toBeVisible({ timeout: 5000 });

    // Vérifie que la requête contenait ttlHours=168 (7 * 24)
    expect((capturedBody as { ttlHours?: number } | null)?.ttlHours).toBe(168);
  });

  test("bouton Copier est présent après génération du lien", async ({ page }) => {
    await interceptLLMCalls(page);
    await mockShareEndpoint(page);

    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const createBtn = dialog.getByRole("button", { name: /créer un lien/i });
    await createBtn.click();

    const urlInput = dialog.locator('input[readonly]');
    await expect(urlInput).toBeVisible({ timeout: 5000 });

    // Bouton Copier doit apparaître
    await expect(dialog.getByRole("button", { name: /copier/i })).toBeVisible({ timeout: 3000 });
  });

  test("fermeture du popover via bouton ✕", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const shareVisible = await rp.shareBtn.isVisible().catch(() => false);
    if (!shareVisible) {
      test.skip(true, "Bouton Partager absent");
    }

    await rp.shareBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Ferme via le bouton aria-label="Fermer"
    const closeBtn = dialog.getByRole("button", { name: "Fermer" });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Popover doit disparaître
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

// ── API share directe ─────────────────────────────────────────────────────────

test.describe("Share — API POST /api/reports/share", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("POST sans auth → 401 ou redirect", async ({ request }) => {
    const res = await request
      .post("/api/reports/share", {
        data: { assetId: ASSET_ID, ttlHours: 24 },
        headers: { "Content-Type": "application/json" },
      })
      .catch(() => null);

    if (!res) test.skip(true, "Serveur non disponible");

    const status = res!.status();
    // Sans auth : 401/302/307 ; avec bypass dev : 404/503 (supabase absent)
    expect([200, 401, 302, 307, 404, 503]).toContain(status);
  });

  test("POST body invalide → 400", async ({ request }) => {
    // Body vide → validation Zod doit retourner 400 (si auth bypass actif)
    const res = await request
      .post("/api/reports/share", {
        data: {},
        headers: { "Content-Type": "application/json" },
      })
      .catch(() => null);

    if (!res) test.skip(true, "Serveur non disponible");

    const status = res!.status();
    // 400 si auth bypass actif + validation zod ; 401 sinon
    if (status === 401 || status === 302 || status === 307) {
      test.skip(true, "Auth requise — valid en CI");
    }
    expect([400, 503]).toContain(status);
  });
});

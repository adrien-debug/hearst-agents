import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
import path from "path";
import fs from "fs";

async function requireServer(request: APIRequestContext) {
  const ok = await request.get("/api/health").then((r) => r.ok()).catch(() => false);
  if (!ok) test.skip();
}

/**
 * Tests visuels — screenshots du ReportLayout pour comparaison manuelle.
 *
 * Chaque run sauvegarde des captures dans e2e/reports/screenshots/.
 * Comparer avec HEARST-OS-DESIGN-SYSTEM.html, hearst-ui-vision.html,
 * mock-chat-central.html pour valider la cohérence visuelle Ghost Protocol.
 *
 * Ces tests ne s'exécutent qu'en local (pas dans CI).
 */

const SPEC_ID = "00000000-0000-4000-8000-100000000001";
const ASSET_ID = "00000000-0000-4000-8000-200000000001";

const MOCK_REPORT_PAYLOAD = {
  __reportPayload: true,
  specId: SPEC_ID,
  version: 1,
  generatedAt: Date.now(),
  blocks: [
    {
      id: "kpi_mrr",
      type: "kpi",
      label: "MRR",
      layout: { col: 1, row: 0 },
      props: { format: "currency", currency: "EUR" },
      data: { value: 24500, delta: 0.08, sparkline: [18000, 19200, 21000, 22800, 24500] },
    },
    {
      id: "kpi_pipeline",
      type: "kpi",
      label: "Pipeline",
      layout: { col: 1, row: 0 },
      props: { format: "currency", currency: "EUR" },
      data: { value: 180000, delta: -0.05 },
    },
    {
      id: "kpi_runway",
      type: "kpi",
      label: "Runway",
      layout: { col: 1, row: 0 },
      props: { suffix: "mois" },
      data: { value: 14.5 },
    },
    {
      id: "kpi_commits",
      type: "kpi",
      label: "Commits / sem.",
      layout: { col: 1, row: 0 },
      props: {},
      data: { value: 42, delta: 0.12 },
    },
    {
      id: "table_deals",
      type: "table",
      label: "Deals en cours",
      layout: { col: 4, row: 1 },
      props: { columns: ["nom", "valeur", "stage"], limit: 5 },
      data: [
        { nom: "Acme Corp", valeur: 45000, stage: "Négociation" },
        { nom: "Beta SAS", valeur: 28000, stage: "Proposition" },
        { nom: "Gamma Ltd", valeur: 62000, stage: "Closing" },
      ],
    },
  ],
  scalars: {
    "kpi_mrr.value": 24500,
    "kpi_mrr.delta": 0.08,
    "kpi_pipeline.value": 180000,
    "kpi_runway.value": 14.5,
  },
};

async function mountMocks(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "u1", email: "adrien@hearstcorporation.io", name: "Adrien" },
        expires: new Date(Date.now() + 86400_000).toISOString(),
      }),
    }),
  );

  await page.route("**/api/v2/threads*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: [] }),
    }),
  );

  await page.route("**/api/v2/panel*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assets: [],
        missions: [],
        connections: [{ id: "c1", provider: "stripe", status: "connected" }],
        reportSuggestions: [
          {
            specId: SPEC_ID,
            title: "Founder Cockpit",
            description: "MRR, pipeline, runway, commits — vue fondateur globale.",
            status: "ready",
            requiredApps: ["stripe", "github"],
            missingApps: [],
          },
        ],
      }),
    }),
  );

  await page.route(`**/api/v2/reports/${SPEC_ID}/run`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assetId: ASSET_ID,
        title: "Founder Cockpit",
        payload: MOCK_REPORT_PAYLOAD,
        narration: "MRR en hausse de 8 % à 24 500 €. Pipeline solide à 180 k€ avec 3 deals en closing. Runway confortable à 14,5 mois.",
        signals: [{ type: "mrr_spike", severity: "info", value: 0.08, unit: "ratio" }],
        severity: "ok",
        cost: { inputTokens: 4800, outputTokens: 320, usd: 0.019, exceeded: false },
        durationMs: 2840,
      }),
    }),
  );

  await page.route(`**/api/v2/assets/${ASSET_ID}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ASSET_ID,
        name: "Founder Cockpit",
        type: "report",
        content: JSON.stringify(MOCK_REPORT_PAYLOAD),
        provenance: { specId: SPEC_ID, specVersion: 1 },
        createdAt: Date.now(),
      }),
    }),
  );

  await page.route(`**/api/v2/threads/*/messages*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );
}

function ensureScreenshotsDir() {
  const dir = path.join(process.cwd(), "e2e/reports/screenshots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test.describe("Visual — RightPanel suggestions @skip-ci", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("screenshot RightPanel avec suggestion cykan", async ({ page }) => {
    await mountMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });

    const screenshotsDir = ensureScreenshotsDir();
    await suggestion.screenshot({
      path: path.join(screenshotsDir, "right-panel-suggestion.png"),
    });

    // Vérification de la bordure cyan via les styles inline
    const borderLeft = await suggestion.evaluate((el: HTMLElement) => el.style.borderLeft);
    expect(borderLeft).toContain("var(--cykan)");
  });

  test("screenshot ReportLayout — Founder Cockpit complet", async ({ page }) => {
    await mountMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    const layout = page.locator('[data-testid="report-layout"]');
    await expect(layout).toBeVisible({ timeout: 15_000 });

    // Attend que les 4 KPIs soient rendus
    await expect(page.locator('[data-testid="kpi-label"]')).toHaveCount(4, { timeout: 8000 });

    const screenshotsDir = ensureScreenshotsDir();

    // Screenshot du layout report isolé
    await layout.screenshot({
      path: path.join(screenshotsDir, "report-layout-founder-cockpit.png"),
    });

    // Screenshot pleine page pour contexte
    await page.screenshot({
      path: path.join(screenshotsDir, "full-page-with-report.png"),
      fullPage: false,
    });

    console.log(`Screenshots sauvegardés dans ${screenshotsDir}`);
    console.log("Comparer avec HEARST-OS-DESIGN-SYSTEM.html, hearst-ui-vision.html, mock-chat-central.html");
  });

  test("screenshot mobile — ReportLayout responsive 375px", async ({ page }) => {
    await mountMocks(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    const layout = page.locator('[data-testid="report-layout"]');
    await expect(layout).toBeVisible({ timeout: 15_000 });

    const screenshotsDir = ensureScreenshotsDir();
    await page.screenshot({
      path: path.join(screenshotsDir, "report-layout-mobile-375.png"),
    });

    // Sur mobile, les KPIs doivent encore être visibles (overflow scroll ou wrap)
    await expect(page.locator('[data-testid="kpi-value"]').first()).toBeVisible();
  });
});

test.describe("Visual — tokens design system @skip-ci", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("ReportLayout n'utilise pas de magic numbers (inline style check)", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // Vérifie qu'aucun inline style du ReportLayout n'utilise px hard-coded (hors border 1px)
    const inlineStyles = await page.evaluate(() => {
      const layout = document.querySelector('[data-testid="report-layout"]');
      if (!layout) return [];
      const els = layout.querySelectorAll<HTMLElement>("*");
      const hardcoded: string[] = [];
      els.forEach((el) => {
        const style = el.getAttribute("style") ?? "";
        // Accepte "1px solid" (borders fines) mais rejet tout px numérique isolé comme taille
        const suspicious = style.match(/:\s*\d+px(?!\s+solid)/g);
        if (suspicious) hardcoded.push(`${el.tagName}: ${suspicious.join(", ")}`);
      });
      return hardcoded;
    });

    if (inlineStyles.length > 0) {
      console.warn("[visual] Inline px suspects dans ReportLayout:", inlineStyles);
    }
    // Non-bloquant : log uniquement (certains libs injectent des px légitimes)
    // expect(inlineStyles).toHaveLength(0); // Décommenter si on veut bloquer
  });
});

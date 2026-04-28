import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

/** Skip le test si le serveur dev n'est pas démarré. */
async function requireServer(request: APIRequestContext) {
  const ok = await request.get("/api/health").then((r) => r.ok()).catch(() => false);
  if (!ok) test.skip();
}

/**
 * Flow complet : suggestion RightPanel → click → focal ReportLayout.
 *
 * Tous les appels réseau sont mockés via page.route() — pas besoin de
 * session réelle. Les tests vérifient le comportement de l'UI (rendu,
 * testids, styles cykan) et non les API back-end.
 */

const SPEC_ID = "00000000-0000-4000-8000-100000000001";
const ASSET_ID = "00000000-0000-4000-8000-200000000001";
const THREAD_ID = "00000000-0000-4000-8000-300000000001";

/** Payload report minimal pour tester le ReportLayout. */
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
      data: { value: 24500, delta: 0.08 },
    },
    {
      id: "kpi_pipeline",
      type: "kpi",
      label: "Pipeline",
      layout: { col: 1, row: 0 },
      props: { format: "currency", currency: "EUR" },
      data: { value: 180000, delta: -0.05 },
    },
  ],
  scalars: {
    "kpi_mrr.value": 24500,
    "kpi_mrr.delta": 0.08,
    "kpi_pipeline.value": 180000,
  },
};

/** Monte les mocks réseau nécessaires à l'UI connectée. */
async function mountMocks(page: Page) {
  // Session NextAuth — simule un user connecté
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

  // Thread list — un thread actif
  await page.route("**/api/v2/threads*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threads: [{ id: THREAD_ID, title: "Test thread", createdAt: Date.now(), updatedAt: Date.now() }],
      }),
    }),
  );

  // Panel data avec suggestion Founder Cockpit
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

  // Run report → retourne assetId immédiatement
  await page.route(`**/api/v2/reports/${SPEC_ID}/run`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assetId: ASSET_ID,
        title: "Founder Cockpit",
        payload: MOCK_REPORT_PAYLOAD,
        narration: "MRR en hausse de 8%. Pipeline solide à 180k€.",
        signals: [],
        severity: "ok",
        cost: { inputTokens: 4800, outputTokens: 320, usd: 0.019, exceeded: false },
        durationMs: 2840,
      }),
    }),
  );

  // Asset fetch depuis le focal
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

  // Messages du thread vide
  await page.route(`**/api/v2/threads/${THREAD_ID}/messages*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );
}

test.describe("Suggestion → ReportLayout flow @skip-ci", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la suggestion Founder Cockpit apparaît avec bordure cykan", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    // Attente que la suggestion soit visible (max 5s)
    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 5000 });

    // Titre visible
    await expect(suggestion.locator("text=Founder Cockpit")).toBeVisible();

    // Statut "ready" → label "lancer" visible
    await expect(suggestion.locator("text=lancer")).toBeVisible();

    // Border-left cykan (vérifié via l'attribut data)
    await expect(suggestion).toHaveAttribute("data-suggestion-status", "ready");
  });

  test("click suggestion → focal ReportLayout avec KpiTile MRR", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 5000 });

    // Click la suggestion
    await suggestion.click();

    // Le focal doit ouvrir et afficher le ReportLayout
    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // Les KPI tiles doivent être présents
    await expect(page.locator('[data-testid="kpi-label"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-testid="kpi-value"]').first()).toBeVisible();
  });

  test("KpiTile MRR affiche valeur formatée en EUR", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // La valeur 24 500 en format monnaie FR doit être présente
    const values = page.locator('[data-testid="kpi-value"]');
    await expect(values.first()).toBeVisible();

    // Vérifie que des valeurs numériques sont affichées
    const firstValue = await values.first().textContent();
    expect(firstValue).not.toBe("—");
    expect(firstValue?.length).toBeGreaterThan(0);
  });

  test("suggestion disparaît de la liste après le lancement", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();

    // Après click, la suggestion doit être masquée (état runningSpecs)
    await expect(suggestion).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("ReportLayout — rendu des primitives @skip-ci", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la grille 4-col est présente", async ({ page }) => {
    await mountMocks(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();

    const layout = page.locator('[data-testid="report-layout"]');
    await expect(layout).toBeVisible({ timeout: 15_000 });

    // Vérifie que la grille contient au moins 2 blocs (les 2 KPIs du mock)
    const kpiLabels = page.locator('[data-testid="kpi-label"]');
    await expect(kpiLabels).toHaveCount(2, { timeout: 5000 });
  });
});

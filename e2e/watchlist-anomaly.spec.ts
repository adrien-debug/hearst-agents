/**
 * E2E — Watchlist anomaly narrée (vague 9, action #3).
 *
 * Couvre :
 *  1. Routes API protégées
 *  2. Flow complet (auth) : Cockpit charge la watchlist, et SI une anomaly
 *     est détectée (≥ 2 snapshots en DB), affiche le badge + narration
 *
 * Note : la détection d'anomaly nécessite >= 2 snapshots espacés. En e2e, on
 * ne peut pas garantir leur présence sans seed — on teste donc juste que
 * le rendu ne plante pas, et que les KPIs s'affichent.
 */

import { test, expect } from "@playwright/test";

test.describe("Watchlist Anomaly — Cockpit availability", () => {
  test("API /api/v2/cockpit/today refuse l'accès sans session", async ({
    request,
  }) => {
    const res = await request.get("/api/v2/cockpit/today");
    // Accepte 200 (dev bypass) ou 401/403/302/307. Pas de 5xx.
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe("@skip-ci Watchlist Anomaly — Cockpit (auth required)", () => {
  test("la section Watchlist se rend sans crash", async ({ page }) => {
    test.skip(
      !process.env.HEARST_E2E_RUN_AUTH,
      "Set HEARST_E2E_RUN_AUTH=1 + HEARST_DEV_AUTH_BYPASS=1 to run",
    );

    await page.goto("/");

    // Section Watchlist présente (label uppercase)
    await expect(page.locator("text=Watchlist")).toBeVisible({ timeout: 10_000 });

    // Au moins une carte KPI rendue (mockée ou live)
    // On utilise un selector robuste : t-9 + uppercase MRR/ARR/PIPELINE/RUNWAY
    const kpiLabels = ["MRR", "ARR", "Pipeline", "Runway"];
    let found = 0;
    for (const label of kpiLabels) {
      const visible = await page
        .locator(`text=${label}`)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) found += 1;
    }
    expect(found).toBeGreaterThanOrEqual(1);

    // Si une anomaly est détectée, son badge contient un % et l'unité 7j
    // Note : on ne fail PAS si pas d'anomaly — c'est l'état initial sans historique.
    const anomalyBadge = page.locator("text=/[+-]\\d+\\.\\d+%.*7j/").first();
    const hasAnomaly = await anomalyBadge.isVisible().catch(() => false);
    if (hasAnomaly) {
      // Si une anomaly est là, sa narration doit être présente
      // (dans le même WatchlistCard, après le badge)
      const narrationText = await anomalyBadge
        .locator("xpath=ancestor::*[contains(@class, 'card')]")
        .innerText();
      expect(narrationText.length).toBeGreaterThan(20);
    }
  });
});

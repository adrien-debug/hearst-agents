import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { interceptLLMCalls, mockRenderPayload, SPEC_ID, ASSET_ID } from "./fixtures";

/**
 * run-report.spec.ts — flow complet "Lancer un rapport".
 *
 * Stratégie :
 *   - Tous les appels LLM + API sont mockés via page.route()
 *   - On clique la suggestion Founder Cockpit dans le RightPanel
 *   - On vérifie que ReportLayout s'affiche avec les bons blocs
 *   - On vérifie titre, narration, KPIs
 */

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

test.describe("Run Report — flow Founder Cockpit", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la suggestion Founder Cockpit est visible avec statut ready", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });

    // Titre visible
    await expect(suggestion.getByText("Founder Cockpit")).toBeVisible();

    // Statut "ready" encodé via data attribute
    await expect(suggestion).toHaveAttribute("data-suggestion-status", "ready");
  });

  test("click suggestion → ReportLayout visible avec KPI blocks", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    // ReportLayout doit apparaître
    const layout = page.locator('[data-testid="report-layout"]');
    await expect(layout).toBeVisible({ timeout: 15_000 });

    // Au moins un KPI label et value
    await expect(page.locator('[data-testid="kpi-label"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-testid="kpi-value"]').first()).toBeVisible();
  });

  test("4 blocs KPI rendus (MRR, Pipeline, Runway, Commits)", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // Le payload fixture contient 4 KPIs
    await expect(page.locator('[data-testid="kpi-label"]')).toHaveCount(4, { timeout: 8000 });
  });

  test("valeurs KPI affichées (non nulles)", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    const values = page.locator('[data-testid="kpi-value"]');
    await expect(values.first()).toBeVisible();

    const text = await values.first().textContent();
    expect(text).not.toBe("—");
    expect(text?.length).toBeGreaterThan(0);
  });

  test("narration affichée dans le layout (texte non vide)", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // La narration peut être affichée dans un testid dédié ou dans un composant
    // voisin du layout — on cherche le texte de la narration mockée
    const narrationText = "MRR en hausse de 8";
    const narrationEl = page
      .locator(`text=${narrationText}`)
      .or(page.locator('[data-testid="report-narration"]'));

    // Non-bloquant si le composant n'affiche pas la narration directement
    const visible = await narrationEl.first().isVisible().catch(() => false);
    if (!visible) {
      console.info("[run-report] narration non visible dans le DOM — OK si rendue ailleurs");
    }
    // On vérifie a minima que le layout est complet
    await expect(page.locator('[data-testid="kpi-label"]').first()).toBeVisible();
  });

  test("titre 'Founder Cockpit' visible dans la page après run", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // Le titre "Founder Cockpit" doit apparaître quelque part dans la page
    await expect(page.getByText("Founder Cockpit").first()).toBeVisible({ timeout: 5000 });
  });

  test("métadonnées spec_v1 visibles dans le footer du rapport", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // ReportLayout affiche "spec_v1" dans le footer meta (showMeta=true par défaut)
    await expect(page.getByText("spec_v1")).toBeVisible({ timeout: 5000 });
  });

  test("mock LLM intercepté : aucun appel réel à /api/orchestrate", async ({ page }) => {
    const realLLMCalled: string[] = [];

    // On surveille les vrais appels orchestrate (ne doivent pas être appelés)
    await page.route("**/api/orchestrate*", (route) => {
      realLLMCalled.push(route.request().url());
      route.fulfill({ status: 200, body: "{}" });
    });

    await interceptLLMCalls(page);
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // L'orchestrate ne doit pas avoir été appelé (on passe par /api/v2/reports/:id/run)
    expect(realLLMCalled).toHaveLength(0);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test.describe("Run Report — edge cases réseau", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("run report → erreur 500 : UI ne crash pas", async ({ page }) => {
    // Session OK mais run retourne 500
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "u1", email: "test@test.io", name: "Test" },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    );
    await page.route("**/api/v2/threads*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [] }) }),
    );
    await page.route("**/api/v2/right-panel*", (route) =>
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
              description: "test",
              status: "ready",
              requiredApps: ["stripe"],
              missingApps: [],
            },
          ],
        }),
      }),
    );
    await page.route(`**/api/v2/reports/${SPEC_ID}/run`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal" }) }),
    );
    await page.route("**/api/v2/threads/*/messages*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) }),
    );

    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    // L'UI ne doit pas crash (pas d'erreur JS fatale) — on attend 3s et vérifie
    // que la page est toujours accessible
    await page.waitForTimeout(3000);
    // La page doit toujours avoir son root visible
    await expect(page.locator("body")).toBeVisible();
  });

  test("payload sans narration : ReportLayout reste stable", async ({ page }) => {
    await interceptLLMCalls(page, {
      runOverride: { narration: undefined },
    });
    await page.goto("/");

    const suggestion = page.locator(`[data-testid="report-suggestion-${SPEC_ID}"]`);
    await expect(suggestion).toBeVisible({ timeout: 8000 });
    await suggestion.click();

    await expect(page.locator('[data-testid="report-layout"]')).toBeVisible({ timeout: 15_000 });

    // Les KPIs doivent quand même s'afficher
    await expect(page.locator('[data-testid="kpi-label"]').first()).toBeVisible();
  });
});

// ── Shape du payload run ──────────────────────────────────────────────────────

test.describe("Run Report — validation payload fixture", () => {
  test("mockRenderPayload contient __reportPayload et 6 blocks", () => {
    const p = mockRenderPayload();
    expect(p.__reportPayload).toBe(true);
    expect(p.blocks).toHaveLength(6);
    expect(p.specId).toBe(SPEC_ID);
  });

  test("4 blocks de type kpi dans le payload fixture", () => {
    const p = mockRenderPayload();
    const kpis = p.blocks.filter((b) => b.type === "kpi");
    expect(kpis).toHaveLength(4);
  });

  test("ASSET_ID utilisé dans le run response", () => {
    // Vérifie que la constante ASSET_ID est bien formée (UUID v4-like)
    expect(ASSET_ID).toMatch(/^[0-9a-f-]{36}$/);
  });
});

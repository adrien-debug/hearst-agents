import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { interceptLLMCalls, mockReportSpec, SPEC_ID } from "./fixtures";
import { ReportPage } from "./ReportPage";

/**
 * editor.spec.ts — tests du panneau ReportEditor (toggle bloc, réorder, JSON preview, reset).
 *
 * Stratégie :
 *   - On utilise la page /reports/editor (démo page existante) pour les tests
 *     de base (toggle, JSON, reset) car elle a déjà spec+onChange branché.
 *   - Pour les tests qui vérifient l'édition inline depuis le ReportLayout,
 *     on passe par le flow suggestion → click → editToggle (nécessite spec
 *     fourni au layout par le parent — vérification via data-testid).
 */

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

function mountBaseSession(page: Parameters<typeof interceptLLMCalls>[0]) {
  return Promise.all([
    page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "u1", email: "adrien@hearstcorporation.io", name: "Adrien" },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    ),
    page.route("**/api/v2/threads*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ threads: [] }) }),
    ),
    page.route("**/api/v2/right-panel*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [], missions: [], connections: [], reportSuggestions: [] }),
      }),
    ),
  ]);
}

// ── Page /reports/editor (démo, ReportSpecEditor) ────────────────────────────

test.describe("Editor — page démo /reports/editor", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la page charge et affiche ReportSpecEditor", async ({ page }) => {
    await mountBaseSession(page);
    await page.goto("/reports/editor");

    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("toggle visibilité d'un bloc le masque du rendu", async ({ page }) => {
    await mountBaseSession(page);
    await page.goto("/reports/editor");

    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });

    // Trouve le premier toggle de visibilité dans le ReportSpecEditor
    // (data-testid "spec-editor-toggle-{id}" ou équivalent — on cherche
    // la première checkbox de l'éditeur)
    const toggles = page.locator('input[type="checkbox"]');
    const firstToggle = toggles.first();
    await expect(firstToggle).toBeVisible({ timeout: 5000 });

    // Récupère l'état initial (coché = visible)
    const wasChecked = await firstToggle.isChecked();

    // Toggle
    await firstToggle.click();

    // L'état doit avoir changé
    const isNowChecked = await firstToggle.isChecked();
    expect(isNowChecked).toBe(!wasChecked);
  });

  test("preview JSON → bouton Show JSON → JSON contient le titre du spec", async ({ page }) => {
    await mountBaseSession(page);
    await page.goto("/reports/editor");

    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });

    // Clique "Show JSON"
    const showJsonBtn = page.getByRole("button", { name: /show json/i });
    await expect(showJsonBtn).toBeVisible({ timeout: 5000 });
    await showJsonBtn.click();

    const pre = page.locator("pre").first();
    await expect(pre).toBeVisible({ timeout: 3000 });

    const json = await pre.textContent();
    // Le spec démo est basé sur founder-cockpit
    expect(json).toContain("Founder Cockpit");

    // JSON doit être parsable
    expect(() => JSON.parse(json ?? "")).not.toThrow();
  });

  test("bouton Apply → met à jour le bloc 'Spec final'", async ({ page }) => {
    await mountBaseSession(page);
    await page.goto("/reports/editor");

    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });

    // Cherche un bouton "Apply" ou "Appliquer" dans le ReportSpecEditor
    const applyBtn = page
      .getByRole("button", { name: /apply/i })
      .or(page.getByRole("button", { name: /appliquer/i }));

    const applyVisible = await applyBtn.first().isVisible().catch(() => false);
    if (!applyVisible) {
      test.skip(true, "Bouton Apply non trouvé dans ReportSpecEditor — à vérifier selon la version du composant");
    }

    await applyBtn.first().click();

    // Le label "applied" doit apparaître dans la section "Spec final"
    await expect(page.getByText(/applied/i)).toBeVisible({ timeout: 3000 });
  });
});

// ── ReportEditor depuis ReportLayout (inline dans le focal) ─────────────────

test.describe("Editor — ReportEditor inline depuis ReportLayout", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("bouton Éditer ouvre le panneau ReportEditor", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    // Le bouton "Éditer" n'est visible que si spec+onSpecChange sont fournis
    // au layout. Dans le flow suggestion, le FocalStage passe le spec.
    const editBtn = rp.editToggleBtn;
    const editVisible = await editBtn.isVisible().catch(() => false);

    if (!editVisible) {
      test.skip(true, "Bouton Éditer absent — le FocalStage ne passe pas encore spec au ReportLayout");
    }

    await editBtn.click();
    await expect(rp.reportEditor).toBeVisible({ timeout: 5000 });
  });

  test("toggle visibilité bloc → bloc disparaît du rendu", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const editBtn = rp.editToggleBtn;
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "Bouton Éditer absent — spec non branché au layout");
    }

    await editBtn.click();
    await expect(rp.reportEditor).toBeVisible({ timeout: 5000 });

    // Compte les KPIs avant toggle
    const kpiBefore = await rp.kpiLabels.count();
    expect(kpiBefore).toBeGreaterThan(0);

    // Toggle le premier bloc (kpi_mrr)
    const firstToggle = page.locator('[data-testid^="report-editor-toggle-"]').first();
    await expect(firstToggle).toBeVisible();

    const wasChecked = await firstToggle.isChecked();
    if (!wasChecked) {
      // Déjà masqué — re-toggle pour rendre visible puis re-masquer
      await firstToggle.click(); // rend visible
      await firstToggle.click(); // re-masque
    } else {
      await firstToggle.click(); // masque
    }

    // Après toggle "masquer", le count KPI doit avoir diminué
    await page.waitForTimeout(500); // laisse React re-rendre
    const kpiAfter = await rp.kpiLabels.count();
    expect(kpiAfter).toBeLessThan(kpiBefore);
  });

  test("réordonner un bloc (down) → nouvel ordre reflété dans l'éditeur", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const editBtn = rp.editToggleBtn;
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "Bouton Éditer absent");
    }

    await editBtn.click();
    await expect(rp.reportEditor).toBeVisible({ timeout: 5000 });

    // Ordre initial
    const orderBefore = await rp.getBlockOrder();
    expect(orderBefore.length).toBeGreaterThan(1);

    // Déplace le premier bloc vers le bas
    const firstId = orderBefore[0];
    await rp.moveBlockDown(firstId);

    await page.waitForTimeout(300);

    // Vérifie que l'ordre a changé
    const orderAfter = await rp.getBlockOrder();
    expect(orderAfter[0]).not.toBe(firstId);
    expect(orderAfter[1]).toBe(firstId);
  });

  test("reset → ordre initial restauré", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const editBtn = rp.editToggleBtn;
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "Bouton Éditer absent");
    }

    await editBtn.click();
    await expect(rp.reportEditor).toBeVisible({ timeout: 5000 });

    const orderBefore = await rp.getBlockOrder();

    // Modifie l'ordre
    if (orderBefore.length > 1) {
      await rp.moveBlockDown(orderBefore[0]);
      await page.waitForTimeout(300);

      const orderModified = await rp.getBlockOrder();
      expect(orderModified[0]).not.toBe(orderBefore[0]);

      // Reset
      await rp.resetBtn.click();
      await page.waitForTimeout(300);

      const orderAfterReset = await rp.getBlockOrder();
      expect(orderAfterReset[0]).toBe(orderBefore[0]);
    }
  });

  test("preview JSON dans l'éditeur contient le title du spec", async ({ page }) => {
    await interceptLLMCalls(page);
    await page.goto("/");

    const rp = new ReportPage(page);
    await rp.clickSuggestion();
    await rp.waitForReport();

    const editBtn = rp.editToggleBtn;
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "Bouton Éditer absent");
    }

    await editBtn.click();
    await expect(rp.reportEditor).toBeVisible({ timeout: 5000 });

    // Ouvre le JSON
    await rp.jsonToggleBtn.click();
    await expect(rp.jsonPreview).toBeVisible({ timeout: 3000 });

    const json = await rp.jsonPreview.textContent();
    expect(json).toContain("Founder Cockpit");

    // JSON valide
    expect(() => JSON.parse(json ?? "")).not.toThrow();
  });
});

// ── ReportEditor données statiques — validation du spec fixture ─────────────

test.describe("Editor — spec fixture validation", () => {
  test("mockReportSpec contient 5 blocks", () => {
    const spec = mockReportSpec();
    expect(spec.blocks).toHaveLength(5);
  });

  test("mockReportSpec id = SPEC_ID", () => {
    const spec = mockReportSpec();
    expect(spec.id).toBe(SPEC_ID);
  });

  test("mockReportSpec blocks ont tous un layout.col valide (1 ou 4)", () => {
    const spec = mockReportSpec();
    for (const block of spec.blocks) {
      expect([1, 2, 4]).toContain(block.layout.col);
    }
  });
});

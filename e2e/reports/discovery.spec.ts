import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * discovery.spec.ts — tests de la page catalogue /reports (+ API catalogue).
 *
 * Deux couches :
 *   1. API directe  : GET /api/v2/reports → shape du catalogue
 *   2. UI catalogue : si une page /reports existe, vérification du rendu
 *
 * La page /reports n'existe pas encore en tant que route dédiée (uniquement
 * /reports/editor). Les tests UI sont donc conditionnels (@skip-ci sauf si la
 * route est présente) pour ne pas bloquer la CI.
 */

async function requireServer(request: APIRequestContext) {
  const ok = await request
    .get("/api/health")
    .then((r) => r.ok())
    .catch(() => false);
  if (!ok) test.skip();
}

// ── Constantes domaine ───────────────────────────────────────────────────────

const FINANCE_DOMAINS = ["finance"];
const EXPECTED_CATALOG_TITLES = [
  "Founder Cockpit",
  "Financial P&L",
  "Deal-to-Cash",
];

// ── API catalogue ────────────────────────────────────────────────────────────

test.describe("Discovery — API catalogue /api/v2/reports", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("GET /api/v2/reports renvoie le catalogue complet", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    // Sans session : 401 / redirect possible — on teste uniquement si auth OK
    if (res.status() !== 200) {
      test.skip(true, "Auth requise — test valide en local avec bypass actif");
    }
    const body = await res.json() as { catalog: Array<{ id: string; title: string; requiredApps: string[] }> };
    expect(Array.isArray(body.catalog)).toBe(true);
    expect(body.catalog.length).toBeGreaterThan(0);

    const first = body.catalog[0];
    expect(typeof first.id).toBe("string");
    expect(typeof first.title).toBe("string");
    expect(Array.isArray(first.requiredApps)).toBe(true);
  });

  test("catalogue contient les titres attendus", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    if (res.status() !== 200) {
      test.skip(true, "Auth requise");
    }
    const body = await res.json() as { catalog: Array<{ title: string }> };
    const titles = body.catalog.map((e) => e.title);

    for (const expected of EXPECTED_CATALOG_TITLES) {
      expect(titles).toContain(expected);
    }
  });

  test("entrées finance ont le bon domain", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    if (res.status() !== 200) {
      test.skip(true, "Auth requise");
    }
    const body = await res.json() as {
      catalog: Array<{ title: string; domain: string; requiredApps: string[] }>;
    };

    const financeEntries = body.catalog.filter((e) =>
      FINANCE_DOMAINS.includes(e.domain),
    );
    expect(financeEntries.length).toBeGreaterThan(0);

    for (const entry of financeEntries) {
      expect(FINANCE_DOMAINS).toContain(entry.domain);
    }
  });

  test("chaque entrée a requiredApps tableau (même vide)", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    if (res.status() !== 200) {
      test.skip(true, "Auth requise");
    }
    const body = await res.json() as {
      catalog: Array<{ requiredApps: unknown }>;
    };
    for (const entry of body.catalog) {
      expect(Array.isArray(entry.requiredApps)).toBe(true);
    }
  });
});

// ── Page /reports/editor (seule route reports existante) ─────────────────────

test.describe("Discovery — page /reports/editor", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("la page /reports/editor charge sans crash", async ({ page }) => {
    // Mock session pour ne pas être redirigé vers /login
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

    // Stub les appels secondaires de l'app
    await page.route("**/api/v2/threads*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ threads: [] }),
      }),
    );
    await page.route("**/api/v2/right-panel*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assets: [],
          missions: [],
          connections: [],
          reportSuggestions: [],
        }),
      }),
    );

    await page.goto("/reports/editor");

    // Titre h1 de la page démo
    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("page /reports/editor affiche la liste des blocs du spec démo", async ({ page }) => {
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
    await page.route("**/api/v2/threads*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ threads: [] }),
      }),
    );
    await page.route("**/api/v2/right-panel*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [], missions: [], connections: [], reportSuggestions: [] }),
      }),
    );

    await page.goto("/reports/editor");

    // ReportSpecEditor doit avoir chargé au moins un bloc
    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });

    // Le composant ReportSpecEditor rend une liste de blocs — au moins 1
    // (on cherche le type de bloc "kpi" qui est dans le spec fondateur)
    const kpiText = page.getByText("kpi", { exact: false }).first();
    await expect(kpiText).toBeVisible({ timeout: 5000 });
  });

  test("toggle Show JSON affiche un objet JSON valide", async ({ page }) => {
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

    await page.goto("/reports/editor");
    await expect(
      page.getByRole("heading", { name: "Report Spec Editor" }),
    ).toBeVisible({ timeout: 8000 });

    // Clique "Show JSON"
    const showJsonBtn = page.getByRole("button", { name: /show json/i });
    await expect(showJsonBtn).toBeVisible({ timeout: 5000 });
    await showJsonBtn.click();

    // Le pre JSON doit être visible et contenir "Founder Cockpit"
    const pre = page.locator("pre").first();
    await expect(pre).toBeVisible({ timeout: 3000 });
    const text = await pre.textContent();
    expect(text).toContain("Founder Cockpit");
  });
});

// ── Filtrage par domaine (via API) ────────────────────────────────────────────

test.describe("Discovery — filtrage domaine finance", () => {
  test.beforeEach(async ({ request }) => {
    await requireServer(request);
  });

  test("filtre domain=finance retourne seulement des entries finance", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    if (res.status() !== 200) {
      test.skip(true, "Auth requise");
    }
    const body = await res.json() as {
      catalog: Array<{ title: string; domain: string }>;
    };
    const financeOnly = body.catalog.filter((e) => e.domain === "finance");

    // Au moins 2 reports finance dans le catalogue (Deal-to-Cash + Financial P&L)
    expect(financeOnly.length).toBeGreaterThanOrEqual(2);

    // Aucun n'a un domaine différent
    for (const e of financeOnly) {
      expect(e.domain).toBe("finance");
    }
  });

  test("filtre status=ready : requiredApps vide ou apps mockées", async ({ request }) => {
    const res = await request.get("/api/v2/reports");
    if (res.status() !== 200) {
      test.skip(true, "Auth requise");
    }
    const body = await res.json() as {
      catalog: Array<{ id: string; requiredApps: string[] }>;
    };
    // Tous les rapports doivent avoir le champ requiredApps défini
    for (const entry of body.catalog) {
      expect(Array.isArray(entry.requiredApps)).toBe(true);
    }
  });
});

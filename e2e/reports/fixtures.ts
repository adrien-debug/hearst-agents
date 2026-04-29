/**
 * fixtures.ts — helpers et payloads réutilisables pour les tests e2e reports.
 *
 * Usage : importer dans chaque spec e2e/reports/*.spec.ts.
 * Aucun appel réseau réel — tout est mocké via page.route().
 */

import type { Page } from "@playwright/test";

// ── IDs stables ─────────────────────────────────────────────────────────────

export const SPEC_ID   = "00000000-0000-4000-8000-100000000001";
export const ASSET_ID  = "00000000-0000-4000-8000-200000000001";
export const THREAD_ID = "00000000-0000-4000-8000-300000000001";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** RenderPayload complet : 4 KPI + 1 sparkline + 1 table. */
export function mockRenderPayload() {
  return {
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
        label: "Pipeline ouvert",
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
        id: "sparkline_mrr",
        type: "sparkline",
        label: "Tendance MRR",
        layout: { col: 2, row: 1 },
        props: { field: "mrr", height: 64, tone: "cykan" },
        data: [
          { mrr: 18000 }, { mrr: 19200 }, { mrr: 21000 },
          { mrr: 22800 }, { mrr: 24500 },
        ],
      },
      {
        id: "table_deals",
        type: "table",
        label: "Deals en cours",
        layout: { col: 4, row: 2 },
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
      "kpi_commits.value": 42,
    },
  };
}

/** ReportSpec minimal (shape utilisé par ReportEditor & preview JSON). */
export function mockReportSpec() {
  return {
    id: SPEC_ID,
    version: 1,
    meta: {
      title: "Founder Cockpit",
      summary: "MRR, pipeline, runway, commits — vue fondateur globale.",
      domain: "founder",
      persona: "founder",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope: {
      tenantId: "tenant-test",
      workspaceId: "ws-test",
      userId: "u1",
    },
    sources: [],
    transforms: [],
    blocks: [
      { id: "kpi_mrr",      type: "kpi",       label: "MRR",            layout: { col: 1, row: 0 }, dataRef: "stripe_mrr",   props: { format: "currency", currency: "EUR" } },
      { id: "kpi_pipeline", type: "kpi",       label: "Pipeline ouvert", layout: { col: 1, row: 0 }, dataRef: "crm_pipeline", props: { format: "currency", currency: "EUR" } },
      { id: "kpi_runway",   type: "kpi",       label: "Runway",          layout: { col: 1, row: 0 }, dataRef: "cashflow",     props: { suffix: "mois" } },
      { id: "kpi_commits",  type: "kpi",       label: "Commits / sem.",  layout: { col: 1, row: 0 }, dataRef: "github_commits", props: {} },
      { id: "table_deals",  type: "table",     label: "Deals en cours",  layout: { col: 4, row: 2 }, dataRef: "crm_deals",   props: { columns: ["nom", "valeur", "stage"], limit: 5 } },
    ],
    cacheTTL: { transform: 300, render: 900 },
  };
}

// ── Mock réseau central ───────────────────────────────────────────────────────

/**
 * interceptLLMCalls — monte tous les mocks réseau pour une session report.
 *
 * - NextAuth session (user connecté)
 * - Threads list
 * - Right-panel data (avec suggestion Founder Cockpit)
 * - POST run → retourne RenderPayload fixture
 * - GET asset → wrappé dans { asset }
 * - Messages du thread → vide
 *
 * @param page  Page Playwright active
 * @param opts  Surcharges optionnelles
 */
export async function interceptLLMCalls(
  page: Page,
  opts?: {
    /** Surcharge partielle du run response (ex: pour tester la narration) */
    runOverride?: Partial<ReturnType<typeof defaultRunResponse>>;
    /** Si true, la suggestion n'apparaît pas dans le right-panel */
    hideSuggestion?: boolean;
  },
) {
  const payload = mockRenderPayload();

  // 1. Session NextAuth
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

  // 2. Threads
  await page.route("**/api/v2/threads*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threads: [
          { id: THREAD_ID, title: "Test thread", createdAt: Date.now(), updatedAt: Date.now() },
        ],
      }),
    }),
  );

  // 3. Right-panel (suggestions)
  const suggestions = opts?.hideSuggestion
    ? []
    : [
        {
          specId: SPEC_ID,
          title: "Founder Cockpit",
          description: "MRR, pipeline, runway, commits — vue fondateur globale.",
          status: "ready",
          requiredApps: ["stripe", "github"],
          missingApps: [],
        },
      ];

  await page.route("**/api/v2/right-panel*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assets: [],
        missions: [],
        connections: [
          { id: "c1", provider: "stripe", status: "connected" },
          { id: "c2", provider: "github", status: "connected" },
        ],
        reportSuggestions: suggestions,
      }),
    }),
  );

  // 4. Run report
  const runRes = { ...defaultRunResponse(payload), ...opts?.runOverride };
  await page.route(`**/api/v2/reports/${SPEC_ID}/run`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(runRes),
    }),
  );

  // 5. Asset
  await page.route(`**/api/v2/assets/${ASSET_ID}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        asset: {
          id: ASSET_ID,
          threadId: THREAD_ID,
          kind: "report",
          title: "Founder Cockpit",
          summary: "MRR, pipeline, runway, commits — vue fondateur globale.",
          contentRef: JSON.stringify(payload),
          createdAt: Date.now(),
          provenance: { specId: SPEC_ID, specVersion: 1 },
        },
      }),
    }),
  );

  // 6. Messages du thread
  await page.route(`**/api/v2/threads/${THREAD_ID}/messages*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );

  // Catch-all threads messages (wildcard)
  await page.route(`**/api/v2/threads/*/messages*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );
}

function defaultRunResponse(payload: ReturnType<typeof mockRenderPayload>) {
  return {
    assetId: ASSET_ID,
    title: "Founder Cockpit",
    payload,
    narration: "MRR en hausse de 8 % à 24 500 €. Pipeline solide à 180 k€. Runway confortable à 14,5 mois.",
    signals: [{ type: "mrr_spike", severity: "info", value: 0.08, unit: "ratio" }],
    severity: "ok",
    cost: { inputTokens: 4800, outputTokens: 320, usd: 0.019, exceeded: false },
    durationMs: 2840,
  };
}

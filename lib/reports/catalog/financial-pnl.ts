/**
 * Financial P&L — Profit & Loss, cash flow et runway pour le founder.
 *
 * Sources :
 *  - Stripe (revenus encaissés via charges + abonnements actifs)
 *  - Comptabilité (charges fixes/variables — QuickBooks via Composio si dispo,
 *    sinon HTTP générique vers un export CSV/JSON tenant)
 *  - Bank (cash position courante — Stripe Balance ou source HTTP)
 *
 * Transforms :
 *  - groupBy(month) sur les revenus + charges, fenêtre 12m
 *  - diff(MoM) sur le revenu net pour détecter chute / pic
 *  - derive(net_margin, runway_months) à partir des agrégats
 *
 * Blocs :
 *  - waterfall (P&L breakdown : revenue → COGS → opex → résultat)
 *  - kpi (runway en mois, burn rate mensuel)
 *  - sparkline (cash trend 12m)
 *  - table (top expenses du dernier mois)
 *
 * Signaux clés : runway_risk (< 6 mois), mrr_drop (revenu en baisse),
 * expense_spike (charges anormalement élevées — pour l'instant remontées via
 * la sévérité globale + narration ; un nouveau type pourra être ajouté côté
 * `lib/reports/signals/types.ts` quand l'agent en charge des signaux le fera).
 *
 * Note : le bloc `waterfall` est en cours d'ajout par un autre agent. Le spec
 * référence ce type tel que défini dans `PRIMITIVE_KINDS` du schema (réservé
 * V2). Au moment du run, si la primitive n'est pas encore implémentée côté
 * `render-blocks` / `lib/reports/blocks/*`, elle dégradera proprement (le
 * payload contiendra la donnée mais la primitive ne rendra rien — tracé dans
 * la roadmap V2).
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const FINANCIAL_PNL_ID = "00000000-0000-4000-8000-100000000004";

export function buildFinancialPnL(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: FINANCIAL_PNL_ID,
    version: 1,
    meta: {
      title: "Financial P&L",
      summary:
        "P&L mensuel, cash position, runway et top expenses sur 12 mois.",
      domain: "finance",
      persona: "founder",
      cadence: "monthly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // Revenus encaissés Stripe — 12 mois.
      {
        id: "stripe_charges",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_CHARGES",
          params: { limit: 100 },
          paginate: { mode: "cursor", maxPages: 12 },
        },
      },
      // Solde Stripe pour le cash position courante.
      {
        id: "stripe_balance",
        kind: "composio",
        spec: { action: "STRIPE_GET_BALANCE", params: {} },
      },
      // Comptabilité — QuickBooks si connecté.
      {
        id: "quickbooks_expenses",
        kind: "composio",
        spec: {
          action: "QUICKBOOKS_LIST_EXPENSES",
          params: { limit: 200 },
        },
      },
      // Abonnements actifs pour MRR récurrent.
      {
        id: "stripe_subscriptions",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_SUBSCRIPTIONS",
          params: { status: "active", limit: 100 },
        },
      },
    ],
    transforms: [
      // ── Revenus mensuels ─────────────────────────────────────
      {
        id: "charges_window",
        op: "window",
        inputs: ["stripe_charges"],
        params: { range: "12m", field: "created_at" },
      },
      {
        id: "revenue_by_month",
        op: "groupBy",
        inputs: ["charges_window"],
        params: {
          by: ["month"],
          measures: [
            { name: "revenue", fn: "sum", field: "amount" },
            { name: "n_charges", fn: "count" },
          ],
        },
      },

      // ── Charges mensuelles ───────────────────────────────────
      {
        id: "expenses_window",
        op: "window",
        inputs: ["quickbooks_expenses"],
        params: { range: "12m", field: "date" },
      },
      {
        id: "expenses_by_month",
        op: "groupBy",
        inputs: ["expenses_window"],
        params: {
          by: ["month"],
          measures: [
            { name: "expenses", fn: "sum", field: "amount" },
            { name: "n_expenses", fn: "count" },
          ],
        },
      },

      // ── P&L par mois (revenu - charges) ──────────────────────
      {
        id: "pnl_join",
        op: "join",
        inputs: ["revenue_by_month", "expenses_by_month"],
        params: {
          on: [{ left: "month", right: "month" }],
          how: "left",
        },
      },
      {
        id: "pnl_by_month",
        op: "derive",
        inputs: ["pnl_join"],
        params: {
          columns: [
            {
              name: "net_income",
              expr: "num(revenue) - num(coalesce(expenses, 0))",
            },
            {
              // Division par 0 → null (cf expr.ts), valeur affichée 0.
              name: "net_margin",
              expr: "(num(revenue) - num(coalesce(expenses, 0))) / num(revenue)",
            },
          ],
        },
      },

      // ── Variation MoM du revenu ──────────────────────────────
      {
        id: "revenue_diff",
        op: "diff",
        inputs: ["revenue_by_month"],
        params: { field: "revenue", window: "1m" },
      },

      // ── MRR courant (charges du mois en cours) ───────────────
      {
        id: "mrr_total",
        op: "groupBy",
        inputs: ["stripe_subscriptions"],
        params: {
          by: [],
          measures: [{ name: "mrr", fn: "sum", field: "plan.amount" }],
        },
      },

      // ── Burn rate (charges 1 mois) ───────────────────────────
      {
        id: "expenses_last_month",
        op: "window",
        inputs: ["quickbooks_expenses"],
        params: { range: "1m", field: "date" },
      },
      {
        id: "burn_rate",
        op: "groupBy",
        inputs: ["expenses_last_month"],
        params: {
          by: [],
          measures: [{ name: "burn", fn: "sum", field: "amount" }],
        },
      },

      // ── Cash position + runway ───────────────────────────────
      {
        id: "cash_position",
        op: "groupBy",
        inputs: ["stripe_balance"],
        params: {
          by: [],
          measures: [{ name: "cash", fn: "sum", field: "available_amount" }],
        },
      },
      // Ajout d'une clé constante pour pouvoir join cash_position et burn_rate
      // (les deux datasets sont des agrégats single-row sans champ commun).
      {
        id: "cash_keyed",
        op: "derive",
        inputs: ["cash_position"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "burn_keyed",
        op: "derive",
        inputs: ["burn_rate"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "runway_calc",
        op: "join",
        inputs: ["cash_keyed", "burn_keyed"],
        params: {
          on: [{ left: "_join", right: "_join" }],
          how: "inner",
        },
      },
      {
        id: "runway_months",
        op: "derive",
        inputs: ["runway_calc"],
        params: {
          columns: [
            {
              // Division par 0 → null (cf expr.ts). On laisse le bloc kpi
              // afficher null comme "n/a" plutôt qu'inventer un sentinel.
              name: "value",
              expr: "num(cash) / num(burn)",
            },
          ],
        },
      },

      // ── Baseline 3 mois pour expense_spike ──────────────────
      // On somme les charges sur 4 mois, on retranche le mois courant et on
      // divise par 3 pour obtenir la moyenne des 3 mois précédents.
      {
        id: "expenses_4m_window",
        op: "window",
        inputs: ["quickbooks_expenses"],
        params: { range: "4m", field: "date" },
      },
      {
        id: "expenses_4m_agg",
        op: "groupBy",
        inputs: ["expenses_4m_window"],
        params: {
          by: [],
          measures: [{ name: "total_4m", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "expenses_4m_keyed",
        op: "derive",
        inputs: ["expenses_4m_agg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "expenses_summary_join",
        op: "join",
        inputs: ["burn_keyed", "expenses_4m_keyed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },
      {
        // Single-row dataset pour le bloc kpi_expenses.
        // value         = charges du mois courant (alias burn)
        // baseline_3m   = moyenne des 3 mois précédents.
        // Division par 0 → null (cf expr.ts) si total_4m absent.
        id: "expenses_summary",
        op: "derive",
        inputs: ["expenses_summary_join"],
        params: {
          columns: [
            { name: "value", expr: "num(burn)" },
            {
              name: "baseline_3m",
              expr: "(num(total_4m) - num(burn)) / 3",
            },
          ],
        },
      },

      // ── Top expenses du mois ─────────────────────────────────
      {
        id: "expenses_by_category",
        op: "groupBy",
        inputs: ["expenses_last_month"],
        params: {
          by: ["category"],
          measures: [
            { name: "total", fn: "sum", field: "amount" },
            { name: "count", fn: "count" },
          ],
        },
      },
      {
        id: "top_expenses",
        op: "rank",
        inputs: ["expenses_by_category"],
        params: { by: "total", direction: "desc", limit: 10 },
      },

      // ── Cash trend mensuelle (cumul net_income) ──────────────
      {
        id: "cash_trend",
        op: "derive",
        inputs: ["pnl_by_month"],
        params: {
          columns: [
            {
              name: "value",
              expr: "num(net_income)",
            },
          ],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_runway",
        type: "kpi",
        label: "Runway",
        dataRef: "runway_months",
        layout: { col: 1, row: 0 },
        props: { field: "value", format: "number", suffix: " mois" },
      },
      {
        id: "kpi_burn",
        type: "kpi",
        label: "Burn rate mensuel",
        dataRef: "burn_rate",
        layout: { col: 1, row: 0 },
        props: { field: "burn", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_mrr",
        type: "kpi",
        label: "MRR",
        dataRef: "mrr_total",
        layout: { col: 1, row: 0 },
        props: {
          field: "mrr",
          format: "currency",
          currency: "EUR",
          compact: true,
        },
      },
      {
        id: "kpi_cash",
        type: "kpi",
        label: "Cash position",
        dataRef: "cash_position",
        layout: { col: 1, row: 0 },
        props: { field: "cash", format: "currency", currency: "EUR", compact: true },
      },
      {
        // Expose `value` (mois courant) + sous-scalaire `baseline_3m` consommé
        // par la rule signal expense_spike (extract.ts).
        id: "kpi_expenses",
        type: "kpi",
        label: "Charges du mois",
        dataRef: "expenses_summary",
        layout: { col: 1, row: 0 },
        props: {
          field: "value",
          format: "currency",
          currency: "EUR",
          compact: true,
          subScalars: { baseline_3m: "baseline_3m" },
        },
      },
      {
        id: "waterfall_pnl",
        type: "waterfall",
        label: "P&L breakdown 12m",
        dataRef: "pnl_by_month",
        layout: { col: 4, row: 1 },
        // Props inline = placeholder pour la validation Zod du schema V2
        // (cf waterfallPropsSchema). Au runtime, le pipeline construit le
        // vrai breakdown depuis pnl_by_month et override `data` côté render.
        props: {
          data: [
            { label: "Revenue", value: 0, type: "start" },
            { label: "COGS", value: 0, type: "delta" },
            { label: "OpEx", value: 0, type: "delta" },
            { label: "Net income", value: 0, type: "total" },
          ],
          format: "currency",
          currency: "EUR",
        },
      },
      {
        id: "spark_cash",
        type: "sparkline",
        label: "Cash trend 12m",
        dataRef: "cash_trend",
        layout: { col: 2, row: 2 },
        props: { field: "value", height: 64 },
      },
      {
        id: "table_top_expenses",
        type: "table",
        label: "Top expenses du mois",
        dataRef: "top_expenses",
        layout: { col: 2, row: 2 },
        props: {
          columns: ["category", "total", "count"],
          labels: {
            category: "Catégorie",
            total: "Montant",
            count: "Lignes",
          },
          formats: { total: "currency" },
          limit: 10,
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 700,
      style: "executive",
    },
    refresh: {
      mode: "scheduled",
      // Le 1er de chaque mois à 8h
      cron: "0 8 1 * *",
      cooldownHours: 24,
    },
    cacheTTL: { raw: 1800, transform: 3600, render: 86400 },
    createdAt: now,
    updatedAt: now,
  };
}

export const FINANCIAL_PNL_REQUIRED_APPS = [
  "stripe",
  "quickbooks",
] as const;

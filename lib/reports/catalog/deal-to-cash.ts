/**
 * Deal-to-Cash — funnel + cycle time du closed-won au paiement encaissé.
 *
 * Sources : HubSpot (deals), Stripe (invoices), QuickBooks optionnel.
 * Affiche un entonnoir des étapes + un tableau des deals "stuck" (passés
 * en closed-won mais sans paiement reçu).
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const DEAL_TO_CASH_ID = "00000000-0000-4000-8000-100000000003";

export function buildDealToCash(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: DEAL_TO_CASH_ID,
    version: 1,
    meta: {
      title: "Deal-to-Cash",
      summary: "Funnel du deal closed-won au paiement Stripe encaissé.",
      domain: "finance",
      persona: "ops",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "hubspot_deals",
        kind: "composio",
        spec: { action: "HUBSPOT_LIST_DEALS", params: { limit: 200 } },
      },
      {
        id: "stripe_invoices",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_INVOICES",
          params: { limit: 200, status: "paid" },
        },
      },
    ],
    transforms: [
      {
        id: "deals_proposal",
        op: "filter",
        inputs: ["hubspot_deals"],
        params: { where: "stage == 'proposal'" },
      },
      {
        id: "deals_negotiation",
        op: "filter",
        inputs: ["hubspot_deals"],
        params: { where: "stage == 'negotiation'" },
      },
      {
        id: "deals_closedwon",
        op: "filter",
        inputs: ["hubspot_deals"],
        params: { where: "stage == 'closedwon'" },
      },
      {
        id: "stages_count",
        op: "unionAll",
        inputs: ["deals_proposal", "deals_negotiation", "deals_closedwon"],
        params: {},
      },
      {
        id: "stages_grouped",
        op: "groupBy",
        inputs: ["stages_count"],
        params: {
          by: ["stage"],
          measures: [{ name: "count", fn: "count" }],
        },
      },
      {
        id: "stuck_deals",
        op: "filter",
        inputs: ["deals_closedwon"],
        params: { where: "isNull(invoice_id)" },
      },
      {
        id: "paid_total",
        op: "groupBy",
        inputs: ["stripe_invoices"],
        params: {
          by: [],
          measures: [{ name: "total", fn: "sum", field: "amount_paid" }],
        },
      },
    ],
    blocks: [
      {
        id: "funnel_stages",
        type: "funnel",
        label: "Funnel deal-to-cash",
        dataRef: "stages_grouped",
        layout: { col: 2, row: 0 },
        props: { labelField: "stage", valueField: "count" },
      },
      {
        id: "kpi_paid",
        type: "kpi",
        label: "Encaissé période",
        dataRef: "paid_total",
        layout: { col: 1, row: 0 },
        props: { field: "total", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_stuck",
        type: "kpi",
        label: "Deals bloqués",
        dataRef: "stuck_deals",
        layout: { col: 1, row: 0 },
        props: { field: "_count", format: "number" },
      },
      {
        id: "table_stuck",
        type: "table",
        label: "Closed-won sans facture",
        dataRef: "stuck_deals",
        layout: { col: 4, row: 1 },
        props: {
          columns: ["dealname", "amount", "closedate", "owner"],
          labels: {
            dealname: "Deal",
            amount: "Montant",
            closedate: "Date close",
            owner: "Propriétaire",
          },
          formats: { closedate: "date", amount: "currency" },
          limit: 20,
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 500,
      style: "operational",
    },
    refresh: {
      mode: "scheduled",
      cron: "0 9 * * 1",
      cooldownHours: 24,
    },
    cacheTTL: { raw: 600, transform: 1200, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

export const DEAL_TO_CASH_REQUIRED_APPS = ["hubspot", "stripe"] as const;

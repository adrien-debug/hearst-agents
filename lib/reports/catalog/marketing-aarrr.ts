/**
 * Marketing AARRR — funnel pirate metrics + CAC/LTV cohorts + attribution.
 *
 * Sources :
 *  - Google Analytics events (acquisition, activation) — slug Composio
 *    `GOOGLE_ANALYTICS_LIST_EVENTS`. Mixpanel reste une alternative ; on
 *    tient sur GA pour rester aligné sur le canal "marketing officiel".
 *  - Stripe charges (revenu / LTV par cohorte client).
 *  - HubSpot contacts (channel d'acquisition pour CAC/attribution).
 *
 * Transforms :
 *  - window(12w) sur events / charges / contacts
 *  - groupBy(channel, cohort_month) → CAC + LTV par cohorte
 *  - derive(cac, ltv, ltv_cac_ratio, payback_months)
 *  - filter event_name ∈ AARRR canoniques + groupBy(event_name) pour funnel
 *
 * Blocs :
 *  - kpi×4 (CAC, LTV, LTV/CAC, payback months)
 *  - funnel AARRR (Acquisition → Activation → Retention → Referral → Revenue)
 *  - cohort_triangle retention par cohort_month
 *  - bar channels par CAC
 *
 * Signaux : on réutilise `mrr_drop` existant via la cohorte de revenu si
 * dérive ; pas de nouveau type ajouté côté `lib/reports/signals/types.ts`.
 *
 * Note : `cohort_triangle` est en cours d'ajout (cf PRIMITIVE_KINDS V2).
 * Le payload (matrice cohort × période) sera consommé par la primitive quand
 * elle sera implémentée.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const MARKETING_AARRR_ID = "00000000-0000-4000-8000-100000000008";

export function buildMarketingAarrr(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: MARKETING_AARRR_ID,
    version: 1,
    meta: {
      title: "Marketing AARRR",
      summary:
        "Funnel AARRR, CAC / LTV / payback par cohorte et canal sur 12 semaines.",
      domain: "growth",
      persona: "marketing",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // Events Google Analytics — fenêtre 12 semaines pour les funnels.
      {
        id: "ga_events",
        kind: "composio",
        spec: {
          action: "GOOGLE_ANALYTICS_LIST_EVENTS",
          params: { limit: 500 },
          paginate: { mode: "cursor", maxPages: 12 },
        },
      },
      // Stripe charges pour LTV / revenu par cohorte.
      {
        id: "stripe_charges",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_CHARGES",
          params: { limit: 500 },
          paginate: { mode: "cursor", maxPages: 12 },
        },
      },
      // HubSpot contacts — channel d'acquisition + spend marketing.
      {
        id: "hubspot_contacts",
        kind: "composio",
        spec: {
          action: "HUBSPOT_LIST_CONTACTS",
          params: { limit: 500 },
          paginate: { mode: "cursor", maxPages: 8 },
        },
      },
    ],
    transforms: [
      // ── Fenêtres 12 semaines ─────────────────────────────────
      {
        id: "events_window",
        op: "window",
        inputs: ["ga_events"],
        params: { range: "12w", field: "timestamp" },
      },
      {
        id: "charges_window",
        op: "window",
        inputs: ["stripe_charges"],
        params: { range: "12w", field: "created_at" },
      },
      {
        id: "contacts_window",
        op: "window",
        inputs: ["hubspot_contacts"],
        params: { range: "12w", field: "createdate" },
      },

      // ── Funnel AARRR : filter + groupBy(event_name) ──────────
      {
        id: "events_aarrr_filter",
        op: "filter",
        inputs: ["events_window"],
        params: {
          where:
            "event_name == 'acquisition' || event_name == 'activation' || event_name == 'retention' || event_name == 'referral' || event_name == 'revenue'",
        },
      },
      {
        id: "funnel_aarrr",
        op: "groupBy",
        inputs: ["events_aarrr_filter"],
        params: {
          by: ["event_name"],
          measures: [{ name: "count", fn: "count" }],
        },
      },

      // ── Cohort triangle : groupBy(cohort_month, period) ──────
      {
        id: "cohort_triangle",
        op: "groupBy",
        inputs: ["events_window"],
        params: {
          by: ["cohort_month", "period"],
          measures: [
            { name: "active_users", fn: "count", field: "user_id" },
          ],
        },
      },

      // ── CAC : spend marketing / contacts acquis par channel ──
      {
        id: "contacts_by_channel",
        op: "groupBy",
        inputs: ["contacts_window"],
        params: {
          by: ["channel"],
          measures: [
            { name: "n_contacts", fn: "count" },
            { name: "spend", fn: "sum", field: "marketing_spend" },
          ],
        },
      },
      {
        id: "cac_by_channel",
        op: "derive",
        inputs: ["contacts_by_channel"],
        params: {
          columns: [
            // Division par 0 → null (cf expr.ts).
            {
              name: "cac",
              expr: "num(spend) / num(n_contacts)",
            },
          ],
        },
      },
      {
        id: "top_channels_by_cac",
        op: "rank",
        inputs: ["cac_by_channel"],
        params: { by: "cac", direction: "desc", limit: 10 },
      },

      // ── CAC global ───────────────────────────────────────────
      {
        id: "cac_global_agg",
        op: "groupBy",
        inputs: ["contacts_window"],
        params: {
          by: [],
          measures: [
            { name: "n_contacts", fn: "count" },
            { name: "spend", fn: "sum", field: "marketing_spend" },
          ],
        },
      },
      {
        id: "cac_global",
        op: "derive",
        inputs: ["cac_global_agg"],
        params: {
          columns: [
            { name: "cac", expr: "num(spend) / num(n_contacts)" },
          ],
        },
      },

      // ── LTV : revenu moyen par customer par cohorte ──────────
      {
        id: "ltv_by_customer",
        op: "groupBy",
        inputs: ["charges_window"],
        params: {
          by: ["customer"],
          measures: [{ name: "ltv_cents", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "ltv_global",
        op: "groupBy",
        inputs: ["ltv_by_customer"],
        params: {
          by: [],
          measures: [
            { name: "ltv", fn: "avg", field: "ltv_cents" },
            { name: "n_customers", fn: "count" },
          ],
        },
      },

      // ── LTV/CAC ratio + payback months ───────────────────────
      {
        id: "cac_keyed",
        op: "derive",
        inputs: ["cac_global"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "ltv_keyed",
        op: "derive",
        inputs: ["ltv_global"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "unit_economics_join",
        op: "join",
        inputs: ["cac_keyed", "ltv_keyed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },
      {
        id: "unit_economics",
        op: "derive",
        inputs: ["unit_economics_join"],
        params: {
          columns: [
            // Division par 0 → null.
            { name: "ltv_cac_ratio", expr: "num(ltv) / num(cac)" },
            // Payback = CAC / (LTV / 12). Approximation mensuelle.
            {
              name: "payback_months",
              expr: "num(cac) / (num(ltv) / 12)",
            },
          ],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_cac",
        type: "kpi",
        label: "CAC",
        dataRef: "cac_global",
        layout: { col: 1, row: 0 },
        props: { field: "cac", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_ltv",
        type: "kpi",
        label: "LTV",
        dataRef: "ltv_global",
        layout: { col: 1, row: 0 },
        props: { field: "ltv", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_ltv_cac",
        type: "kpi",
        label: "LTV / CAC",
        dataRef: "unit_economics",
        layout: { col: 1, row: 0 },
        props: { field: "ltv_cac_ratio", format: "number" },
      },
      {
        id: "kpi_payback",
        type: "kpi",
        label: "Payback (mois)",
        dataRef: "unit_economics",
        layout: { col: 1, row: 0 },
        props: { field: "payback_months", format: "number" },
      },
      {
        id: "funnel_aarrr_block",
        type: "funnel",
        label: "Funnel AARRR",
        dataRef: "funnel_aarrr",
        layout: { col: 2, row: 1 },
        props: { labelField: "event_name", valueField: "count" },
      },
      {
        id: "cohort_retention",
        type: "cohort_triangle",
        label: "Rétention par cohorte",
        dataRef: "cohort_triangle",
        layout: { col: 2, row: 1 },
        // Props inline = placeholder pour la validation Zod du schema V2
        // (cf cohortTrianglePropsSchema). Au runtime, le pipeline alimente
        // cohorts depuis le dataset cohort_triangle.
        props: {
          cohorts: [{ label: "M0", values: [0] }],
          periodPrefix: "M",
          asPercent: true,
        },
      },
      {
        id: "bar_channels_cac",
        type: "bar",
        label: "Channels par CAC",
        dataRef: "top_channels_by_cac",
        layout: { col: 4, row: 2 },
        props: {
          labelField: "channel",
          valueField: "cac",
          orientation: "horizontal",
          format: "currency",
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 700,
      style: "operational",
    },
    refresh: {
      mode: "scheduled",
      // Lundi 9h
      cron: "0 9 * * 1",
      cooldownHours: 12,
    },
    cacheTTL: { raw: 900, transform: 1800, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

export const MARKETING_AARRR_REQUIRED_APPS = [
  "googleanalytics",
  "stripe",
  "hubspot",
] as const;

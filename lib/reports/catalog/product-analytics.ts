/**
 * Product Analytics — funnels AARRR, retention cohorts, NPS, feature usage.
 *
 * Sources :
 *  - Mixpanel (events) via Composio. Si l'utilisateur n'a pas Mixpanel, on
 *    laisse Amplitude en alternative ; les deux toolkits exposent un slug
 *    `*_LIST_EVENTS`. Le builder déclare Mixpanel par défaut — un autre
 *    toolkit pourra être substitué via une variante du builder plus tard.
 *  - Stripe (LTV / pricing — cohorte de revenu)
 *  - Intercom (CSAT / NPS surveys quand le tool NPS dédié n'est pas connecté)
 *
 * Transforms :
 *  - groupBy(cohort_month) sur les events signup → produit la table cohorte
 *  - window(quarterly) pour limiter la fenêtre AARRR
 *  - filter par event_name + groupBy pour extraire chaque étape du funnel
 *
 * Blocs :
 *  - cohort_triangle (retention C1..C12)
 *  - funnel (AARRR : Acquisition → Activation → Retention → Revenue → Referral)
 *  - kpi (NPS, MAU, DAU/MAU stickiness)
 *  - bar (top features par usage)
 *
 * Signaux clés : retention_drop, feature_adoption_low, nps_decline (à ajouter
 * côté `lib/reports/signals/types.ts` quand l'agent en charge des signaux le
 * fera). Pour l'instant, la sévérité globale tombera sur les rules existantes
 * (mrr_drop si revenu cohorte chute) et la narration commentera le reste.
 *
 * Note : `cohort_triangle` est en cours d'ajout (cf PRIMITIVE_KINDS V2).
 * Le spec produit le payload attendu (matrice cohorte × période) et le
 * primitive consommera quand elle sera implémentée.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const PRODUCT_ANALYTICS_ID = "00000000-0000-4000-8000-100000000005";

export function buildProductAnalytics(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: PRODUCT_ANALYTICS_ID,
    version: 1,
    meta: {
      title: "Product Analytics",
      summary:
        "Funnel AARRR, cohortes de rétention, NPS, features les plus utilisées.",
      domain: "growth",
      persona: "founder",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // Events bruts Mixpanel — fenêtré 12 semaines.
      {
        id: "mixpanel_events",
        kind: "composio",
        spec: {
          action: "MIXPANEL_LIST_EVENTS",
          params: { limit: 500 },
          paginate: { mode: "cursor", maxPages: 12 },
        },
      },
      // Stripe pour LTV par cohorte de revenu.
      {
        id: "stripe_charges",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_CHARGES",
          params: { limit: 500 },
        },
      },
      // NPS / surveys via Intercom.
      {
        id: "intercom_surveys",
        kind: "composio",
        spec: {
          action: "INTERCOM_LIST_CONVERSATIONS",
          params: { tag: "nps", limit: 200 },
        },
      },
    ],
    transforms: [
      // ── Fenêtre quarterly (12 semaines) ──────────────────────
      {
        id: "events_window",
        op: "window",
        inputs: ["mixpanel_events"],
        params: { range: "12w", field: "timestamp" },
      },

      // ── AARRR funnel : un seul groupBy(event_name) puis filter ──
      // Limité aux 5 events AARRR canoniques pour le funnel.
      {
        id: "events_aarrr_filter",
        op: "filter",
        inputs: ["events_window"],
        params: {
          where:
            "event_name == 'signup' || event_name == 'activated' || event_name == 'returned' || event_name == 'subscription_started' || event_name == 'referral_sent'",
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
      // On cohort sur l'ensemble de la fenêtre, pas seulement les events
      // de retention — pour avoir des cohortes complètes.
      {
        id: "cohort_triangle",
        op: "groupBy",
        inputs: ["events_window"],
        params: {
          by: ["cohort_month", "period"],
          measures: [
            { name: "active_users", fn: "count" },
            { name: "users_distinct", fn: "count", field: "user_id" },
          ],
        },
      },

      // ── MAU (Monthly Active Users) ───────────────────────────
      {
        id: "events_mau_window",
        op: "window",
        inputs: ["events_window"],
        params: { range: "1m", field: "timestamp" },
      },
      {
        id: "mau",
        op: "groupBy",
        inputs: ["events_mau_window"],
        params: {
          by: [],
          measures: [{ name: "count", fn: "count", field: "user_id" }],
        },
      },

      // ── DAU (Daily Active Users) ─────────────────────────────
      {
        id: "events_dau_window",
        op: "window",
        inputs: ["events_window"],
        params: { range: "1d", field: "timestamp" },
      },
      {
        id: "dau",
        op: "groupBy",
        inputs: ["events_dau_window"],
        params: {
          by: [],
          measures: [{ name: "count", fn: "count", field: "user_id" }],
        },
      },

      // ── NPS — moyenne des scores Intercom ────────────────────
      {
        id: "nps_score",
        op: "groupBy",
        inputs: ["intercom_surveys"],
        params: {
          by: [],
          measures: [
            { name: "score", fn: "avg", field: "nps_score" },
            { name: "responses", fn: "count" },
          ],
        },
      },

      // ── Top features par event_name ──────────────────────────
      {
        id: "events_features",
        op: "filter",
        inputs: ["events_window"],
        params: { where: "startsWith(event_name, 'feature_')" },
      },
      {
        id: "feature_usage",
        op: "groupBy",
        inputs: ["events_features"],
        params: {
          by: ["event_name"],
          measures: [{ name: "uses", fn: "count" }],
        },
      },
      {
        id: "top_features",
        op: "rank",
        inputs: ["feature_usage"],
        params: { by: "uses", direction: "desc", limit: 10 },
      },

      // ── kpi_top_feature : single-row {value: uses_top1, mau} ─
      // Permet à la rule signal feature_adoption_low de comparer value/mau.
      {
        id: "top_feature_single",
        op: "rank",
        inputs: ["feature_usage"],
        params: { by: "uses", direction: "desc", limit: 1 },
      },
      {
        id: "top_feature_keyed",
        op: "derive",
        inputs: ["top_feature_single"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "mau_keyed_for_feature",
        op: "derive",
        inputs: ["mau"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "top_feature_summary_join",
        op: "join",
        inputs: ["top_feature_keyed", "mau_keyed_for_feature"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },
      {
        // value = uses (adoption top feature), mau = MAU global.
        // Champ "count" venant de mau (groupBy by:[] count user_id).
        id: "top_feature_summary",
        op: "derive",
        inputs: ["top_feature_summary_join"],
        params: {
          columns: [
            { name: "value", expr: "num(uses)" },
            { name: "mau", expr: "num(count)" },
          ],
        },
      },

      // ── kpi_nps : sous-scalaire previous via diff sum/2 ─────
      // diff sans timeField fait slice du middle des rows (premier moitié =
      // previous, second = current). On agrège la sum du score sur chaque
      // demi-fenêtre et on rapporte un avg approximatif via la division par
      // moitié responses. Pour la rule nps_decline on a besoin de score
      // (value) et previous score : on calcule via une seule diff op +
      // derive pour normaliser en moyenne.
      {
        id: "nps_score_diff",
        op: "diff",
        inputs: ["intercom_surveys"],
        params: { field: "nps_score", window: "12w" },
      },

      // ── kpi_retention_c2 : current C2 + baseline (avg histo) ─
      {
        id: "c2_filter",
        op: "filter",
        inputs: ["cohort_triangle"],
        params: { where: "period == 2" },
      },
      {
        id: "c2_baseline_agg",
        op: "groupBy",
        inputs: ["c2_filter"],
        params: {
          by: [],
          measures: [{ name: "baseline", fn: "avg", field: "active_users" }],
        },
      },
      {
        id: "c2_current",
        op: "rank",
        inputs: ["c2_filter"],
        params: { by: "cohort_month", direction: "desc", limit: 1 },
      },
      {
        id: "c2_current_keyed",
        op: "derive",
        inputs: ["c2_current"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "c2_baseline_keyed",
        op: "derive",
        inputs: ["c2_baseline_agg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "c2_summary",
        op: "join",
        inputs: ["c2_current_keyed", "c2_baseline_keyed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },
    ],
    blocks: [
      {
        // value = sum NPS période courante, previous = sum période précédente
        // (pivot via diff en mode "no timeField"). La rule nps_decline compare
        // simplement value < previous - 10 ; le sens est conservé même si on
        // travaille en sum plutôt qu'avg car les fenêtres sont équilibrées.
        // subScalars.previous alimente la rule nps_decline (extract.ts).
        id: "kpi_nps",
        type: "kpi",
        label: "NPS (somme période)",
        dataRef: "nps_score_diff",
        layout: { col: 1, row: 0 },
        props: {
          field: "current",
          format: "number",
          // Publie kpi_nps.value = first["current"] et kpi_nps.previous via
          // subScalars. La rule nps_decline lit kpi_nps.value et
          // kpi_nps.previous.
          subScalars: { previous: "previous" },
        },
      },
      {
        id: "kpi_mau",
        type: "kpi",
        label: "MAU",
        dataRef: "mau",
        layout: { col: 1, row: 0 },
        props: { field: "count", format: "number", compact: true },
      },
      {
        id: "kpi_dau",
        type: "kpi",
        label: "DAU",
        dataRef: "dau",
        layout: { col: 1, row: 0 },
        props: { field: "count", format: "number", compact: true },
      },
      {
        id: "kpi_responses",
        type: "kpi",
        label: "Réponses NPS",
        dataRef: "nps_score",
        layout: { col: 1, row: 0 },
        props: { field: "responses", format: "number" },
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
          cohorts: [
            { label: "M0", values: [0] },
          ],
          periodPrefix: "M",
          asPercent: true,
        },
      },
      {
        id: "bar_features",
        type: "bar",
        label: "Top features",
        dataRef: "top_features",
        layout: { col: 4, row: 2 },
        props: {
          labelField: "event_name",
          valueField: "uses",
          orientation: "horizontal",
        },
      },
      {
        // Adoption top feature (single-row). subScalars.mau alimente la rule
        // feature_adoption_low (value/mau < 20%).
        id: "kpi_top_feature",
        type: "kpi",
        label: "Adoption top feature",
        dataRef: "top_feature_summary",
        layout: { col: 1, row: 2 },
        props: {
          field: "value",
          format: "number",
          compact: true,
          subScalars: { mau: "mau" },
        },
      },
      {
        // Rétention C2 (cohort 2e période). subScalars.baseline alimente la
        // rule retention_drop (value < baseline - 5pp).
        id: "kpi_retention_c2",
        type: "kpi",
        label: "Rétention C2",
        dataRef: "c2_summary",
        layout: { col: 1, row: 2 },
        props: {
          field: "active_users",
          format: "number",
          subScalars: { baseline: "baseline" },
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
    cacheTTL: { raw: 900, transform: 1800, render: 86400 },
    createdAt: now,
    updatedAt: now,
  };
}

export const PRODUCT_ANALYTICS_REQUIRED_APPS = [
  "mixpanel",
  "stripe",
  "intercom",
] as const;

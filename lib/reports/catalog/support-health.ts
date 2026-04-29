/**
 * Support Health — CSAT, SLA, volume tickets, performance agents.
 *
 * Sources :
 *  - Intercom (tickets, conversations, ratings)
 *  - Zendesk en alternative — non requis si Intercom est connecté.
 *  - NPS / surveys via Intercom (ratings.csat).
 *
 * Transforms :
 *  - groupBy(hour_of_day, day_of_week) → heatmap volume
 *  - rank(top_issues) sur les catégories de tickets
 *  - window(7d) pour la fenêtre SLA
 *  - groupBy(category) sur le respect SLA
 *
 * Blocs :
 *  - heatmap (volume tickets jour × heure)
 *  - bar (taux de respect SLA par catégorie)
 *  - kpi (CSAT, FRT — First Response Time, MTTR — Mean Time to Resolution)
 *  - table (top issues + frequency)
 *
 * Signaux clés : support_overload (existant), csat_drop, sla_breach (à ajouter
 * côté `lib/reports/signals/types.ts` quand l'agent en charge des signaux le
 * fera). Pour l'instant la rule existante `support_overload` (kpi_inbox >= 50
 * ou kpi_tickets >= 5) sera réutilisée si on rebaptise des kpis ;  ici on
 * garde des ids spécifiques (kpi_csat, kpi_frt, kpi_mttr, kpi_volume) car
 * cohérent avec le persona support et la roadmap signaux.
 *
 * Note : `heatmap` est en cours d'ajout (cf PRIMITIVE_KINDS V2). Le payload
 * produit (matrice rows={day_of_week} × columns={hour_of_day} → count) sera
 * consommé par la primitive quand elle sera implémentée.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const SUPPORT_HEALTH_ID = "00000000-0000-4000-8000-100000000006";

export function buildSupportHealth(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: SUPPORT_HEALTH_ID,
    version: 1,
    meta: {
      title: "Support Health",
      summary:
        "CSAT, SLA, volume tickets et top issues sur les 7 derniers jours.",
      domain: "support",
      persona: "csm",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // Tickets / conversations Intercom — fenêtre 7 jours.
      {
        id: "intercom_conversations",
        kind: "composio",
        spec: {
          action: "INTERCOM_LIST_CONVERSATIONS",
          params: { limit: 200 },
          paginate: { mode: "cursor", maxPages: 8 },
        },
      },
      // Ratings CSAT.
      {
        id: "intercom_ratings",
        kind: "composio",
        spec: {
          action: "INTERCOM_LIST_RATINGS",
          params: { limit: 200 },
        },
      },
      // SLA breaches / events de SLA (slug Composio Zendesk-style).
      {
        id: "intercom_sla_events",
        kind: "composio",
        spec: {
          action: "INTERCOM_LIST_SLA_EVENTS",
          params: { limit: 200 },
        },
      },
    ],
    transforms: [
      // ── Fenêtre 7 jours pour les conversations ──────────────
      {
        id: "conv_window",
        op: "window",
        inputs: ["intercom_conversations"],
        params: { range: "7d", field: "created_at" },
      },

      // ── Heatmap volume : day_of_week × hour_of_day ───────────
      // On suppose que la source expose `day_of_week` et `hour_of_day` ; sinon
      // un mapping côté SourceRef.mapping pourra les dériver.
      {
        id: "volume_heatmap",
        op: "pivot",
        inputs: ["conv_window"],
        params: {
          rows: ["day_of_week"],
          columns: "hour_of_day",
          values: { field: "id", fn: "count" },
        },
      },

      // ── Volume total ─────────────────────────────────────────
      {
        id: "volume_total",
        op: "groupBy",
        inputs: ["conv_window"],
        params: {
          by: [],
          measures: [{ name: "n_tickets", fn: "count" }],
        },
      },

      // ── CSAT moyen 7j ────────────────────────────────────────
      {
        id: "ratings_window",
        op: "window",
        inputs: ["intercom_ratings"],
        params: { range: "7d", field: "created_at" },
      },
      {
        id: "csat_avg",
        op: "groupBy",
        inputs: ["ratings_window"],
        params: {
          by: [],
          measures: [
            { name: "csat", fn: "avg", field: "rating" },
            { name: "n_responses", fn: "count" },
          ],
        },
      },

      // ── CSAT baseline 30j (pour signal csat_drop) ────────────
      {
        id: "ratings_30d_window",
        op: "window",
        inputs: ["intercom_ratings"],
        params: { range: "30d", field: "created_at" },
      },
      {
        id: "csat_30d_avg",
        op: "groupBy",
        inputs: ["ratings_30d_window"],
        params: {
          by: [],
          measures: [
            { name: "baseline", fn: "avg", field: "rating" },
          ],
        },
      },
      {
        id: "csat_7d_keyed",
        op: "derive",
        inputs: ["csat_avg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "csat_30d_keyed",
        op: "derive",
        inputs: ["csat_30d_avg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        // Single-row {value=csat 7j, baseline=csat 30j}. La rule csat_drop
        // compare value < baseline - 5pp.
        id: "csat_7d_summary",
        op: "join",
        inputs: ["csat_7d_keyed", "csat_30d_keyed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },

      // ── FRT (First Response Time) — moyenne en minutes ──────
      {
        id: "frt_avg",
        op: "groupBy",
        inputs: ["conv_window"],
        params: {
          by: [],
          measures: [
            { name: "frt_minutes", fn: "avg", field: "first_response_time" },
          ],
        },
      },

      // ── MTTR (Mean Time To Resolution) — moyenne en minutes ─
      {
        id: "conv_resolved",
        op: "filter",
        inputs: ["conv_window"],
        params: { where: "state == 'closed'" },
      },
      {
        id: "mttr_avg",
        op: "groupBy",
        inputs: ["conv_resolved"],
        params: {
          by: [],
          measures: [
            { name: "mttr_minutes", fn: "avg", field: "resolution_time" },
          ],
        },
      },

      // ── SLA respect par catégorie ────────────────────────────
      {
        id: "sla_by_category",
        op: "groupBy",
        inputs: ["intercom_sla_events"],
        params: {
          by: ["category"],
          measures: [
            { name: "total", fn: "count" },
            { name: "breaches", fn: "sum", field: "is_breach" },
          ],
        },
      },
      {
        id: "sla_compliance",
        op: "derive",
        inputs: ["sla_by_category"],
        params: {
          columns: [
            // Taux de respect = 1 - breaches / total. Division par 0 → null.
            {
              name: "compliance_rate",
              expr: "1 - num(breaches) / num(total)",
            },
          ],
        },
      },

      // ── SLA overall (compliance moyenne ratio 0-1) ───────────
      // La rule sla_breach lit kpi_sla.value (compliance < 90%).
      {
        id: "sla_overall",
        op: "groupBy",
        inputs: ["sla_compliance"],
        params: {
          by: [],
          measures: [{ name: "value", fn: "avg", field: "compliance_rate" }],
        },
      },

      // ── Top issues : groupBy(category) sur les conversations ─
      {
        id: "issues_by_category",
        op: "groupBy",
        inputs: ["conv_window"],
        params: {
          by: ["category"],
          measures: [
            { name: "n", fn: "count" },
            { name: "csat_avg", fn: "avg", field: "rating" },
          ],
        },
      },
      {
        id: "top_issues",
        op: "rank",
        inputs: ["issues_by_category"],
        params: { by: "n", direction: "desc", limit: 10 },
      },
    ],
    blocks: [
      {
        // value = csat 7j, sous-scalaire baseline = csat 30j (rule csat_drop).
        id: "kpi_csat_7d",
        type: "kpi",
        label: "CSAT 7j",
        dataRef: "csat_7d_summary",
        layout: { col: 1, row: 0 },
        props: {
          field: "csat",
          format: "number",
          subScalars: { baseline: "baseline" },
        },
      },
      {
        id: "kpi_frt",
        type: "kpi",
        label: "First Response (min)",
        dataRef: "frt_avg",
        layout: { col: 1, row: 0 },
        props: { field: "frt_minutes", format: "number" },
      },
      {
        id: "kpi_mttr",
        type: "kpi",
        label: "Time to Resolution (min)",
        dataRef: "mttr_avg",
        layout: { col: 1, row: 0 },
        props: { field: "mttr_minutes", format: "number" },
      },
      {
        id: "kpi_volume",
        type: "kpi",
        label: "Volume tickets 7j",
        dataRef: "volume_total",
        layout: { col: 1, row: 0 },
        props: { field: "n_tickets", format: "number" },
      },
      {
        // value = compliance moyenne (ratio 0-1). La rule sla_breach se
        // déclenche si value < 0.9.
        id: "kpi_sla",
        type: "kpi",
        label: "SLA respecté",
        dataRef: "sla_overall",
        layout: { col: 1, row: 0 },
        props: { field: "value", format: "percent" },
      },
      {
        id: "heatmap_volume",
        type: "heatmap",
        label: "Volume tickets — heure × jour",
        dataRef: "volume_heatmap",
        layout: { col: 4, row: 1 },
        // Props inline = placeholder pour la validation Zod du schema V2
        // (cf heatmapPropsSchema). Au runtime, le pipeline alimente
        // xLabels/yLabels/values depuis volume_heatmap (pivot day×hour).
        props: {
          xLabels: ["00h"],
          yLabels: ["lun"],
          values: [[0]],
          showValues: false,
        },
      },
      {
        id: "bar_sla",
        type: "bar",
        label: "Respect SLA par catégorie",
        dataRef: "sla_compliance",
        layout: { col: 2, row: 2 },
        props: {
          labelField: "category",
          valueField: "compliance_rate",
          format: "percent",
          orientation: "horizontal",
        },
      },
      {
        id: "table_top_issues",
        type: "table",
        label: "Top issues",
        dataRef: "top_issues",
        layout: { col: 2, row: 2 },
        props: {
          columns: ["category", "n", "csat_avg"],
          labels: {
            category: "Catégorie",
            n: "Volume",
            csat_avg: "CSAT moyen",
          },
          formats: { csat_avg: "number" },
          limit: 10,
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 600,
      style: "operational",
    },
    refresh: {
      mode: "scheduled",
      // Quotidien à 8h
      cron: "0 8 * * *",
      cooldownHours: 6,
    },
    cacheTTL: { raw: 600, transform: 1200, render: 1800 },
    createdAt: now,
    updatedAt: now,
  };
}

export const SUPPORT_HEALTH_REQUIRED_APPS = [
  "intercom",
] as const;

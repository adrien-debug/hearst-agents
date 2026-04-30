/**
 * HR / People — hiring funnel, burnout signals, headcount plan.
 *
 * Sources :
 *  - Greenhouse candidates (hiring funnel, time-to-hire, offer rate).
 *  - Slack messages (signaux burnout : late-hours / weekends / spikes).
 *  - HRIS (headcount, open roles) — slug Composio générique
 *    `BAMBOOHR_LIST_EMPLOYEES`. Si l'app HRIS canonique du tenant est
 *    différente (Personio, Rippling), on garde un slug HRIS_LIST_EMPLOYEES
 *    fallback côté builder utilisateur — ici on tient sur BambooHR.
 *
 * Transforms :
 *  - window(90d) sur candidates / messages / employees
 *  - groupBy(stage) → hiring funnel
 *  - derive(time_to_hire, offer_acceptance_rate)
 *  - groupBy(employee, week) → burnout heatmap (jour × heure)
 *  - pivot(day_of_week × hour_of_day) → activité tardive
 *
 * Blocs :
 *  - kpi×4 (Open roles, Time-to-hire, Offer rate, Headcount)
 *  - funnel hiring stages
 *  - bar candidats par étape
 *  - heatmap activité tardive (jour × heure)
 *
 * Signaux : `burnout_risk` (via kpi_late_activity) et `meeting_overload`
 * (via kpi_meeting_hours) sont déclarés dans `lib/reports/signals/types.ts`
 * et extraits par extract.ts. La narration commente aussi les écarts sur le
 * hiring (taux d'offre faible, time-to-hire).
 *
 * Note : `heatmap` est en cours d'ajout (cf PRIMITIVE_KINDS V2). Le payload
 * (matrice day_of_week × hour_of_day → count) sera consommé par la primitive
 * quand elle sera implémentée.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const HR_PEOPLE_ID = "00000000-0000-4000-8000-100000000009";

export function buildHrPeople(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: HR_PEOPLE_ID,
    version: 1,
    meta: {
      title: "HR / People",
      summary:
        "Hiring funnel, signaux burnout (heures tardives) et headcount plan sur 90 jours.",
      domain: "people",
      persona: "people",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // Candidats Greenhouse — funnel hiring 90 jours.
      {
        id: "greenhouse_candidates",
        kind: "composio",
        spec: {
          action: "GREENHOUSE_LIST_CANDIDATES",
          params: { limit: 200 },
          paginate: { mode: "cursor", maxPages: 8 },
        },
      },
      // Messages Slack pour détecter signaux burnout (late-night / weekends).
      {
        id: "slack_messages",
        kind: "composio",
        spec: {
          action: "SLACK_LIST_MESSAGES",
          params: { limit: 500 },
          paginate: { mode: "cursor", maxPages: 8 },
        },
      },
      // Employés actifs — headcount + open roles (BambooHR).
      {
        id: "hris_employees",
        kind: "composio",
        spec: {
          action: "BAMBOOHR_LIST_EMPLOYEES",
          params: { limit: 200 },
        },
      },
      // Évènements Google Calendar 7 jours — pour calculer les heures de
      // meeting hebdomadaires (signal meeting_overload > 30h/semaine).
      {
        id: "gcal_events",
        kind: "native_google",
        spec: {
          service: "calendar",
          op: "events.list",
          params: { timeMin: "-7d", maxResults: 500 },
        },
      },
    ],
    transforms: [
      // ── Fenêtres 90 jours ────────────────────────────────────
      {
        id: "candidates_window",
        op: "window",
        inputs: ["greenhouse_candidates"],
        params: { range: "90d", field: "created_at" },
      },
      {
        id: "messages_window",
        op: "window",
        inputs: ["slack_messages"],
        params: { range: "90d", field: "ts" },
      },

      // ── Hiring funnel : groupBy(stage) ───────────────────────
      {
        id: "candidates_by_stage",
        op: "groupBy",
        inputs: ["candidates_window"],
        params: {
          by: ["stage"],
          measures: [{ name: "count", fn: "count" }],
        },
      },

      // ── Time-to-hire (avg en jours sur candidats hired) ──────
      {
        id: "candidates_hired",
        op: "filter",
        inputs: ["candidates_window"],
        params: { where: "stage == 'hired'" },
      },
      {
        id: "time_to_hire",
        op: "groupBy",
        inputs: ["candidates_hired"],
        params: {
          by: [],
          measures: [
            { name: "tth_days", fn: "avg", field: "time_to_hire_days" },
            { name: "n_hires", fn: "count" },
          ],
        },
      },

      // ── Offer acceptance rate ────────────────────────────────
      {
        id: "candidates_offered",
        op: "filter",
        inputs: ["candidates_window"],
        params: {
          where: "stage == 'offer' || stage == 'offer_accepted' || stage == 'hired'",
        },
      },
      {
        id: "offers_agg",
        op: "groupBy",
        inputs: ["candidates_offered"],
        params: {
          by: [],
          measures: [
            { name: "n_offers", fn: "count" },
            { name: "n_accepted", fn: "sum", field: "is_accepted" },
          ],
        },
      },
      {
        id: "offer_rate",
        op: "derive",
        inputs: ["offers_agg"],
        params: {
          columns: [
            // Division par 0 → null.
            { name: "rate", expr: "num(n_accepted) / num(n_offers)" },
          ],
        },
      },

      // ── Headcount + open roles ───────────────────────────────
      {
        id: "headcount_active",
        op: "filter",
        inputs: ["hris_employees"],
        params: { where: "status == 'active'" },
      },
      {
        id: "headcount_total",
        op: "groupBy",
        inputs: ["headcount_active"],
        params: {
          by: [],
          measures: [{ name: "headcount", fn: "count" }],
        },
      },
      {
        id: "open_roles",
        op: "filter",
        inputs: ["candidates_window"],
        params: { where: "stage == 'open' || stage == 'sourcing'" },
      },
      {
        id: "open_roles_agg",
        op: "groupBy",
        inputs: ["open_roles"],
        params: {
          by: [],
          measures: [{ name: "n_open", fn: "count", field: "role" }],
        },
      },

      // ── Burnout signals : activité jour × heure ──────────────
      // On suppose que la source slack_messages expose `day_of_week`
      // et `hour_of_day` (sinon mapping côté SourceRef.mapping pourra
      // les dériver depuis `ts`).
      {
        id: "burnout_heatmap",
        op: "pivot",
        inputs: ["messages_window"],
        params: {
          rows: ["day_of_week"],
          columns: "hour_of_day",
          values: { field: "id", fn: "count" },
        },
      },

      // ── Late activity ratio (signal burnout_risk) ────────────
      // Convention : late = hour_of_day >= 20 OU <= 5 OU jour=samedi/dimanche.
      // value = late_count / total_messages_count (ratio).
      // La rule burnout_risk simple compare kpi_late_activity.value > 0.25.
      {
        id: "late_or_weekend_filter",
        op: "filter",
        inputs: ["messages_window"],
        params: {
          where:
            "hour_of_day >= 20 || hour_of_day <= 5 || day_of_week == 'sat' || day_of_week == 'sun'",
        },
      },
      {
        id: "late_activity_agg",
        op: "groupBy",
        inputs: ["late_or_weekend_filter"],
        params: {
          by: [],
          measures: [{ name: "late_count", fn: "count" }],
        },
      },
      {
        id: "messages_total_agg",
        op: "groupBy",
        inputs: ["messages_window"],
        params: {
          by: [],
          measures: [{ name: "total_count", fn: "count" }],
        },
      },
      {
        id: "late_activity_keyed",
        op: "derive",
        inputs: ["late_activity_agg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "messages_total_keyed",
        op: "derive",
        inputs: ["messages_total_agg"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "late_activity_join",
        op: "join",
        inputs: ["late_activity_keyed", "messages_total_keyed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "inner" },
      },
      {
        // Single-row { value = ratio late/total }. Division par 0 → null
        // (cf expr.ts) : la rule skip si total_count = 0.
        id: "late_activity_summary",
        op: "derive",
        inputs: ["late_activity_join"],
        params: {
          columns: [
            { name: "value", expr: "num(late_count) / num(total_count)" },
          ],
        },
      },

      // ── Heures de meeting hebdomadaires (signal meeting_overload) ─
      // Source : Google Calendar — events de la semaine courante (7d).
      // On suppose que chaque event expose `duration_hours` (calculé côté
      // mapping SourceRef ou exposé nativement par l'API). On agrège la somme
      // pour obtenir le total d'heures de meeting sur 7 jours.
      {
        id: "gcal_window",
        op: "window",
        inputs: ["gcal_events"],
        params: { range: "7d", field: "start_time" },
      },
      {
        // Single-row { meeting_hours = sum des durées en heures }.
        id: "meeting_hours_agg",
        op: "groupBy",
        inputs: ["gcal_window"],
        params: {
          by: [],
          measures: [{ name: "meeting_hours", fn: "sum", field: "duration_hours" }],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_open_roles",
        type: "kpi",
        label: "Open roles",
        dataRef: "open_roles_agg",
        layout: { col: 1, row: 0 },
        props: { field: "n_open", format: "number" },
      },
      {
        id: "kpi_tth",
        type: "kpi",
        label: "Time-to-hire (j)",
        dataRef: "time_to_hire",
        layout: { col: 1, row: 0 },
        props: { field: "tth_days", format: "number" },
      },
      {
        id: "kpi_offer_rate",
        type: "kpi",
        label: "Offer acceptance rate",
        dataRef: "offer_rate",
        layout: { col: 1, row: 0 },
        props: { field: "rate", format: "percent" },
      },
      {
        id: "kpi_headcount",
        type: "kpi",
        label: "Headcount",
        dataRef: "headcount_total",
        layout: { col: 1, row: 0 },
        props: { field: "headcount", format: "number" },
      },
      {
        id: "funnel_hiring",
        type: "funnel",
        label: "Hiring funnel",
        dataRef: "candidates_by_stage",
        layout: { col: 2, row: 1 },
        props: { labelField: "stage", valueField: "count" },
      },
      {
        id: "bar_stages",
        type: "bar",
        label: "Candidats par étape",
        dataRef: "candidates_by_stage",
        layout: { col: 2, row: 1 },
        props: {
          labelField: "stage",
          valueField: "count",
          orientation: "horizontal",
        },
      },
      {
        // value = ratio (heures soir/weekend) / total messages. La rule
        // burnout_risk simple sur kpi_late_activity déclenche si value > 0.25.
        id: "kpi_late_activity",
        type: "kpi",
        label: "Activité hors heures ouvrées",
        dataRef: "late_activity_summary",
        layout: { col: 1, row: 0 },
        props: { field: "value", format: "percent" },
      },
      {
        // value = heures de meeting sur 7 jours. La rule meeting_overload
        // dans extract.ts se déclenche si value > 30 (MEETING_OVERLOAD_HOURS).
        id: "kpi_meeting_hours",
        type: "kpi",
        label: "Heures de meeting (7j)",
        dataRef: "meeting_hours_agg",
        layout: { col: 1, row: 0 },
        props: { field: "meeting_hours", format: "number" },
      },
      {
        id: "heatmap_burnout",
        type: "heatmap",
        label: "Activité tardive — heure × jour",
        dataRef: "burnout_heatmap",
        layout: { col: 4, row: 2 },
        // Props inline = placeholder pour la validation Zod du schema V2
        // (cf heatmapPropsSchema). Au runtime, le pipeline alimente
        // xLabels/yLabels/values depuis burnout_heatmap.
        props: {
          xLabels: ["00h"],
          yLabels: ["lun"],
          values: [[0]],
          showValues: false,
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
      // Lundi 8h
      cron: "0 8 * * 1",
      cooldownHours: 24,
    },
    cacheTTL: { raw: 1200, transform: 2400, render: 86400 },
    createdAt: now,
    updatedAt: now,
  };
}

export const HR_PEOPLE_REQUIRED_APPS = [
  "greenhouse",
  "slack",
  "bamboohr",
] as const;

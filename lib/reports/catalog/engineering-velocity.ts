/**
 * Engineering Velocity — DORA metrics + cycle time + top long-running PRs.
 *
 * Sources :
 *  - GitHub Pull Requests (cycle time, PR throughput, contributor distribution)
 *  - GitHub Deployments (deploy frequency, lead time)
 *  - Linear Issues (lead time, CFR via failed_release flag)
 *  - GitHub Incidents — on utilise une source HTTP générique vers l'API
 *    incidents/issues filtrées par label `incident` quand le toolkit Composio
 *    n'expose pas encore d'action dédiée. URL paramétrable côté tenant.
 *
 * Transforms :
 *  - window(28d) sur PR / deployments / issues
 *  - groupBy(week) → deploy frequency, throughput, lead time
 *  - derive(deploy_frequency, lead_time, change_failure_rate, mttr)
 *  - diff(WoW) sur cycle_time pour détecter dérive
 *
 * Blocs :
 *  - kpi×4 (DORA : Deploy Freq, Lead Time, CFR, MTTR)
 *  - sparkline cycle_time hebdo
 *  - bar cycle_time par contributor
 *  - table top long-running PRs
 *
 * Signaux clés : cycle_time_drift, commit_velocity_drop (existants côté
 * `lib/reports/signals/types.ts`). Pas de nouveau type ajouté ici.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const ENGINEERING_VELOCITY_ID = "00000000-0000-4000-8000-100000000007";

export function buildEngineeringVelocity(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: ENGINEERING_VELOCITY_ID,
    version: 1,
    meta: {
      title: "Engineering Velocity",
      summary:
        "DORA metrics (Deploy Freq, Lead Time, CFR, MTTR), cycle time et top long-running PRs sur 28 jours.",
      domain: "ops-eng",
      persona: "engineering",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      // PRs GitHub — fenêtre 28 jours.
      {
        id: "github_pulls",
        kind: "composio",
        spec: {
          action: "GITHUB_LIST_PULLS",
          params: { state: "all", limit: 200 },
          paginate: { mode: "cursor", maxPages: 8 },
        },
      },
      // Deployments GitHub — pour deploy frequency + lead time.
      {
        id: "github_deployments",
        kind: "composio",
        spec: {
          action: "GITHUB_LIST_DEPLOYMENTS",
          params: { limit: 200 },
          paginate: { mode: "cursor", maxPages: 4 },
        },
      },
      // Issues Linear — lead time tickets et failed_release pour CFR.
      {
        id: "linear_issues",
        kind: "composio",
        spec: {
          action: "LINEAR_LIST_ISSUES",
          params: { limit: 200 },
          paginate: { mode: "cursor", maxPages: 4 },
        },
      },
      // Incidents — fallback HTTP générique (Composio n'expose pas d'action
      // incidents stabilisée). L'URL pointe vers l'API GitHub issues filtrées
      // par label "incident". À remplacer par un slug Composio dédié dès qu'il
      // sera disponible.
      {
        id: "github_incidents",
        kind: "http",
        spec: {
          url: "https://api.github.com/search/issues?q=label:incident+is:issue&per_page=100",
          method: "GET",
          headers: { Accept: "application/vnd.github+json" },
        },
      },
    ],
    transforms: [
      // ── Fenêtres 28 jours ────────────────────────────────────
      {
        id: "pulls_window",
        op: "window",
        inputs: ["github_pulls"],
        params: { range: "28d", field: "created_at" },
      },
      {
        id: "deploys_window",
        op: "window",
        inputs: ["github_deployments"],
        params: { range: "28d", field: "created_at" },
      },
      {
        id: "incidents_window",
        op: "window",
        inputs: ["github_incidents"],
        params: { range: "28d", field: "created_at" },
      },

      // ── Cycle time hebdo (PR closed) ─────────────────────────
      {
        id: "pulls_merged",
        op: "filter",
        inputs: ["pulls_window"],
        params: { where: "isNotNull(merged_at)" },
      },
      {
        id: "cycle_time_by_week",
        op: "groupBy",
        inputs: ["pulls_merged"],
        params: {
          by: ["week"],
          measures: [
            { name: "cycle_time_hours", fn: "avg", field: "cycle_time_hours" },
            { name: "n_prs", fn: "count" },
          ],
        },
      },
      // Variation WoW du cycle time pour détecter dérive.
      {
        id: "cycle_time_diff",
        op: "diff",
        inputs: ["cycle_time_by_week"],
        params: { field: "cycle_time_hours", window: "1w" },
      },

      // ── Cycle time par contributor (top 10) ──────────────────
      {
        id: "cycle_time_by_author",
        op: "groupBy",
        inputs: ["pulls_merged"],
        params: {
          by: ["author"],
          measures: [
            { name: "cycle_time_hours", fn: "avg", field: "cycle_time_hours" },
            { name: "n_prs", fn: "count" },
          ],
        },
      },
      {
        id: "top_authors",
        op: "rank",
        inputs: ["cycle_time_by_author"],
        params: { by: "n_prs", direction: "desc", limit: 10 },
      },

      // ── DORA : Deploy frequency (28 jours) ───────────────────
      {
        id: "deploy_freq",
        op: "groupBy",
        inputs: ["deploys_window"],
        params: {
          by: [],
          measures: [{ name: "deploys_28d", fn: "count" }],
        },
      },

      // ── DORA : Lead time (issue → résolution, en heures) ────
      // Source canonique = Linear pour aligner sur la définition DORA
      // "time from first commit / ticket open to delivery".
      {
        id: "issues_resolved",
        op: "filter",
        inputs: ["linear_issues"],
        params: { where: "isNotNull(completed_at)" },
      },
      {
        // measures :
        //   lead_time_hours : moyenne (= value du KPI)
        //   baseline        : médiane historique sur la même fenêtre.
        //                     Utilisée comme proxy "baseline" par la rule
        //                     lead_time_drift (avg > 1.3 × median signale
        //                     que la queue de quelques tickets dérive).
        //   n_issues        : count (volume).
        id: "lead_time",
        op: "groupBy",
        inputs: ["issues_resolved"],
        params: {
          by: [],
          measures: [
            { name: "lead_time_hours", fn: "avg", field: "lead_time_hours" },
            { name: "baseline", fn: "median", field: "lead_time_hours" },
            { name: "n_issues", fn: "count" },
          ],
        },
      },

      // ── DORA : Change Failure Rate ───────────────────────────
      {
        id: "deploy_failed",
        op: "filter",
        inputs: ["deploys_window"],
        params: { where: "status == 'failure' || failed_release == true" },
      },
      {
        id: "cfr_failed",
        op: "groupBy",
        inputs: ["deploy_failed"],
        params: {
          by: [],
          measures: [{ name: "failed", fn: "count" }],
        },
      },
      {
        id: "cfr_join_keyed_freq",
        op: "derive",
        inputs: ["deploy_freq"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "cfr_join_keyed_failed",
        op: "derive",
        inputs: ["cfr_failed"],
        params: { columns: [{ name: "_join", expr: "1" }] },
      },
      {
        id: "cfr_join",
        op: "join",
        inputs: ["cfr_join_keyed_freq", "cfr_join_keyed_failed"],
        params: { on: [{ left: "_join", right: "_join" }], how: "left" },
      },
      {
        id: "cfr_calc",
        op: "derive",
        inputs: ["cfr_join"],
        params: {
          columns: [
            // Division par 0 → null (cf expr.ts).
            {
              name: "cfr",
              expr: "num(coalesce(failed, 0)) / num(deploys_28d)",
            },
          ],
        },
      },

      // ── DORA : MTTR (incidents) ──────────────────────────────
      {
        id: "incidents_resolved",
        op: "filter",
        inputs: ["incidents_window"],
        params: { where: "isNotNull(resolved_at)" },
      },
      {
        id: "mttr",
        op: "groupBy",
        inputs: ["incidents_resolved"],
        params: {
          by: [],
          measures: [
            { name: "mttr_hours", fn: "avg", field: "resolution_time_hours" },
            { name: "n_incidents", fn: "count" },
          ],
        },
      },

      // ── Top long-running PRs (still open) ────────────────────
      {
        id: "pulls_open",
        op: "filter",
        inputs: ["pulls_window"],
        params: { where: "state == 'open'" },
      },
      {
        id: "top_long_prs",
        op: "rank",
        inputs: ["pulls_open"],
        params: { by: "age_hours", direction: "desc", limit: 10 },
      },

      // ── Incidents : value (count fenêtre courante) +
      //              baseline_4w (proxy via diff sur 28j marqués n=1).
      // Le diff op slice les rows en deux moitiés (premier moitié = previous,
      // seconde = current). Avec n=1 partout, sum(n) = count → on récupère
      // count_courant et count_précédent. Pour la rule incident_spike,
      // value = current (incidents semaine récente) et baseline_4w = previous
      // (incidents 14j antérieurs comme proxy de baseline). Ça reste cohérent
      // avec l'esprit "current > 1.5×baseline" et tient sous MAX_TRANSFORMS=24.
      {
        id: "incidents_marked",
        op: "derive",
        inputs: ["incidents_window"],
        params: { columns: [{ name: "n", expr: "1" }] },
      },
      {
        id: "incidents_diff",
        op: "diff",
        inputs: ["incidents_marked"],
        params: { field: "n", window: "28d" },
      },
    ],
    blocks: [
      {
        id: "kpi_deploy_freq",
        type: "kpi",
        label: "Deploy frequency 28j",
        dataRef: "deploy_freq",
        layout: { col: 1, row: 0 },
        props: { field: "deploys_28d", format: "number" },
      },
      {
        // value = avg lead time, baseline = median (proxy de la valeur
        // historique typique). La rule lead_time_drift compare value /
        // baseline > 1.3.
        id: "kpi_lead_time",
        type: "kpi",
        label: "Lead time (h)",
        dataRef: "lead_time",
        layout: { col: 1, row: 0 },
        props: {
          field: "lead_time_hours",
          format: "number",
          subScalars: { baseline: "baseline" },
        },
      },
      {
        // Block id aligné sur la rule signal change_failure_high (>15%).
        id: "kpi_change_failure_rate",
        type: "kpi",
        label: "Change Failure Rate",
        dataRef: "cfr_calc",
        layout: { col: 1, row: 0 },
        props: { field: "cfr", format: "percent" },
      },
      {
        id: "kpi_mttr",
        type: "kpi",
        label: "MTTR (h)",
        dataRef: "mttr",
        layout: { col: 1, row: 0 },
        props: { field: "mttr_hours", format: "number" },
      },
      {
        id: "spark_cycle_time",
        type: "sparkline",
        label: "Cycle time hebdo",
        dataRef: "cycle_time_by_week",
        layout: { col: 2, row: 1 },
        props: { field: "cycle_time_hours", height: 64 },
      },
      {
        id: "bar_cycle_by_author",
        type: "bar",
        label: "Cycle time par contributor",
        dataRef: "top_authors",
        layout: { col: 2, row: 1 },
        props: {
          labelField: "author",
          valueField: "cycle_time_hours",
          orientation: "horizontal",
        },
      },
      {
        id: "table_long_prs",
        type: "table",
        label: "Top long-running PRs",
        dataRef: "top_long_prs",
        layout: { col: 4, row: 2 },
        props: {
          columns: ["title", "author", "age_hours", "url"],
          labels: {
            title: "Titre",
            author: "Auteur",
            age_hours: "Âge (h)",
            url: "Lien",
          },
          formats: { age_hours: "number" },
          limit: 10,
        },
      },
      {
        // value = cycle time courant, delta = variation WoW (delta_pct).
        // La rule cycle_time_drift compare kpi_cycle.delta >= 0.20.
        id: "kpi_cycle",
        type: "kpi",
        label: "Cycle time (h)",
        dataRef: "cycle_time_diff",
        layout: { col: 1, row: 0 },
        props: {
          field: "current",
          deltaField: "delta_pct",
          format: "number",
        },
      },
      {
        // value = incidents fenêtre courante, baseline_4w = incidents
        // fenêtre précédente (proxy). La rule incident_spike compare
        // value > baseline_4w * 1.5.
        id: "kpi_incidents",
        type: "kpi",
        label: "Incidents",
        dataRef: "incidents_diff",
        layout: { col: 1, row: 0 },
        props: {
          field: "current",
          format: "number",
          subScalars: { baseline_4w: "previous" },
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
      // Lundi 8h (revue hebdo eng).
      cron: "0 8 * * 1",
      cooldownHours: 12,
    },
    cacheTTL: { raw: 900, transform: 1800, render: 86400 },
    createdAt: now,
    updatedAt: now,
  };
}

export const ENGINEERING_VELOCITY_REQUIRED_APPS = [
  "github",
  "linear",
] as const;

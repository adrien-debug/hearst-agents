/**
 * Hospitality Guest Satisfaction — NPS, reviews, complaints recovery.
 *
 * Sources mockées : surveys post-stay, Google reviews, TripAdvisor, app
 * messaging in-stay. Aggregate par canal + complaints + recovery rate.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";
import { getMockSatisfaction } from "@/lib/verticals/hospitality/mock-data";

export const HOSPITALITY_GUEST_SATISFACTION_ID =
  "00000000-0000-4000-8000-700000000003";

export function buildHospitalityGuestSatisfaction(
  scope: ReportSpec["scope"],
): ReportSpec {
  const now = Date.now();

  return {
    id: HOSPITALITY_GUEST_SATISFACTION_ID,
    version: 1,
    meta: {
      title: "Guest Satisfaction — NPS & Reviews",
      summary:
        "NPS par canal, reviews aggregées, complaints, taux de recovery.",
      domain: "support",
      persona: "csm",
      cadence: "weekly",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "guest_satisfaction",
        kind: "composio",
        spec: { action: "GUEST_SATISFACTION_AGGREGATE", params: { range: "7d" } },
      },
    ],
    transforms: [
      {
        id: "nps_avg",
        op: "groupBy",
        inputs: ["guest_satisfaction"],
        params: {
          by: [],
          measures: [
            { name: "nps", fn: "avg", field: "nps" },
            { name: "score", fn: "avg", field: "averageScore" },
            { name: "responses_total", fn: "sum", field: "responses" },
          ],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_nps",
        type: "kpi",
        label: "NPS",
        dataRef: "nps_avg",
        layout: { col: 1, row: 0 },
        props: { field: "nps", format: "number" },
      },
      {
        id: "kpi_score",
        type: "kpi",
        label: "Score moyen",
        dataRef: "nps_avg",
        layout: { col: 1, row: 0 },
        props: { field: "score", format: "number" },
      },
      {
        id: "kpi_responses",
        type: "kpi",
        label: "Réponses 7j",
        dataRef: "nps_avg",
        layout: { col: 2, row: 0 },
        props: { field: "responses_total", format: "number" },
      },
      {
        id: "table_satisfaction",
        type: "table",
        label: "Détail par canal",
        dataRef: "guest_satisfaction",
        layout: { col: 4, row: 1 },
        props: {
          columns: ["channel", "responses", "nps", "averageScore"],
          labels: {
            channel: "Canal",
            responses: "Réponses",
            nps: "NPS",
            averageScore: "Score",
          },
          limit: 12,
        },
      },
      {
        id: "bar_nps_channel",
        type: "bar",
        label: "NPS par canal",
        dataRef: "guest_satisfaction",
        layout: { col: 4, row: 2 },
        props: {
          xField: "channel",
          yField: "nps",
          format: "number",
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 500,
      style: "executive",
    },
    refresh: {
      mode: "scheduled",
      cron: "0 8 * * 1",
      cooldownHours: 0,
    },
    cacheTTL: { raw: 600, transform: 1800, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

export const HOSPITALITY_GUEST_SATISFACTION_REQUIRED_APPS = ["pms"] as const;

export function buildHospitalityGuestSatisfactionSampleData() {
  return {
    guest_satisfaction: getMockSatisfaction(),
  };
}

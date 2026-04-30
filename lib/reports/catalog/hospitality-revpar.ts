/**
 * Hospitality RevPAR — analyse revenue par chambre disponible sur 30j.
 *
 * Décompose RevPAR = occupancy × ADR. Trends 30 jours, comparaison vs
 * période précédente, breakdown par segment (direct / OTA / corporate /
 * group). Sources : "pms" placeholder. Sample data dans mock-data.ts.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";
import {
  getMockRevpar30d,
  getMockRevenueBySource,
} from "@/lib/verticals/hospitality/mock-data";

export const HOSPITALITY_REVPAR_ID = "00000000-0000-4000-8000-700000000002";

export function buildHospitalityRevpar(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: HOSPITALITY_REVPAR_ID,
    version: 1,
    meta: {
      title: "RevPAR & ADR — 30 jours",
      summary:
        "RevPAR, ADR, occupancy détaillés sur 30 jours + segmentation revenue.",
      domain: "finance",
      persona: "ops",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "pms_revpar_30d",
        kind: "composio",
        spec: { action: "PMS_REVPAR_TIMESERIES", params: { range: "30d" } },
      },
      {
        id: "pms_revenue_source",
        kind: "composio",
        spec: { action: "PMS_REVENUE_BY_SOURCE", params: { range: "30d" } },
      },
    ],
    transforms: [
      {
        id: "revpar_avg",
        op: "groupBy",
        inputs: ["pms_revpar_30d"],
        params: {
          by: [],
          measures: [
            { name: "revpar_avg", fn: "avg", field: "revpar" },
            { name: "adr_avg", fn: "avg", field: "adr" },
            { name: "occupancy_avg", fn: "avg", field: "occupancy" },
          ],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_revpar",
        type: "kpi",
        label: "RevPAR (avg 30j)",
        dataRef: "revpar_avg",
        layout: { col: 1, row: 0 },
        props: { field: "revpar_avg", format: "currency", currency: "EUR" },
      },
      {
        id: "kpi_adr",
        type: "kpi",
        label: "ADR (avg 30j)",
        dataRef: "revpar_avg",
        layout: { col: 1, row: 0 },
        props: { field: "adr_avg", format: "currency", currency: "EUR" },
      },
      {
        id: "kpi_occ",
        type: "kpi",
        label: "Occupancy (avg 30j)",
        dataRef: "revpar_avg",
        layout: { col: 2, row: 0 },
        props: { field: "occupancy_avg", format: "percent" },
      },
      {
        id: "spark_revpar",
        type: "sparkline",
        label: "RevPAR — 30 derniers jours",
        dataRef: "pms_revpar_30d",
        layout: { col: 4, row: 1 },
        props: { field: "revpar", height: 96 },
      },
      {
        id: "bar_revenue_segment",
        type: "bar",
        label: "Revenue par segment",
        dataRef: "pms_revenue_source",
        layout: { col: 4, row: 2 },
        props: {
          xField: "source",
          yField: "amount",
          format: "currency",
          currency: "EUR",
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
      cron: "0 7 * * *",
      cooldownHours: 0,
    },
    cacheTTL: { raw: 600, transform: 1800, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

export const HOSPITALITY_REVPAR_REQUIRED_APPS = ["pms"] as const;

export function buildHospitalityRevparSampleData() {
  return {
    pms_revpar_30d: getMockRevpar30d(),
    pms_revenue_source: getMockRevenueBySource(),
  };
}

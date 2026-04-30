/**
 * Hospitality Daily Briefing — vue opérationnelle quotidienne d'un hôtel.
 *
 * KPIs : occupancy (yesterday/today/forecast), ADR, RevPAR, arrivals,
 * departures, VIP count, pending service requests. Tables : arrivals du
 * jour avec VIP flag + special requests, departures du jour avec late
 * checkout. Bar chart : revenue by source (direct/OTA/corporate/group).
 *
 * Sources : "pms" (placeholder Composio — pas de connecteur réel encore).
 * En MVP les données sont injectées par le runtime via mock-data.ts. Le
 * Spec reste valide Zod parce que les sources/transforms sont des stubs
 * inertes ; le rendu UI consomme les `props.data` inline sur les blocks
 * (fallback prévu par le schéma pour primitives V2 ; pour V1 on passe par
 * `props.data` que les blocks tolèrent en sample mode).
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";
import {
  getMockArrivals,
  getMockDepartures,
  getMockRevenueBySource,
  getMockKpiSnapshot,
} from "@/lib/verticals/hospitality/mock-data";

export const HOSPITALITY_DAILY_BRIEF_ID =
  "00000000-0000-4000-8000-700000000001";

export function buildHospitalityDailyBrief(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: HOSPITALITY_DAILY_BRIEF_ID,
    version: 1,
    meta: {
      title: "Daily Briefing — Hospitality",
      summary:
        "Occupancy, ADR/RevPAR, arrivals/departures du jour + VIP + service requests.",
      domain: "ops",
      persona: "ops",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "pms_arrivals",
        kind: "composio",
        spec: { action: "PMS_LIST_ARRIVALS_TODAY", params: { limit: 100 } },
      },
      {
        id: "pms_departures",
        kind: "composio",
        spec: { action: "PMS_LIST_DEPARTURES_TODAY", params: { limit: 100 } },
      },
      {
        id: "pms_revenue",
        kind: "composio",
        spec: { action: "PMS_LIST_REVENUE_BY_SOURCE", params: { range: "1d" } },
      },
      {
        id: "pms_kpi_snapshot",
        kind: "composio",
        spec: { action: "PMS_KPI_SNAPSHOT", params: { range: "today" } },
      },
    ],
    transforms: [],
    blocks: [
      {
        id: "kpi_occupancy",
        type: "kpi",
        label: "Occupancy",
        dataRef: "pms_kpi_snapshot",
        layout: { col: 1, row: 0 },
        props: { field: "occupancy", format: "percent" },
      },
      {
        id: "kpi_adr",
        type: "kpi",
        label: "ADR",
        dataRef: "pms_kpi_snapshot",
        layout: { col: 1, row: 0 },
        props: { field: "adr", format: "currency", currency: "EUR" },
      },
      {
        id: "kpi_revpar",
        type: "kpi",
        label: "RevPAR",
        dataRef: "pms_kpi_snapshot",
        layout: { col: 1, row: 0 },
        props: { field: "revpar", format: "currency", currency: "EUR" },
      },
      {
        id: "kpi_vips",
        type: "kpi",
        label: "VIP arrivals",
        dataRef: "pms_kpi_snapshot",
        layout: { col: 1, row: 0 },
        props: { field: "vipCount", format: "number" },
      },
      {
        id: "table_arrivals",
        type: "table",
        label: "Arrivées du jour",
        dataRef: "pms_arrivals",
        layout: { col: 2, row: 1 },
        props: {
          columns: ["guestName", "room", "eta", "vip", "specialRequest"],
          labels: {
            guestName: "Guest",
            room: "Chambre",
            eta: "ETA",
            vip: "VIP",
            specialRequest: "Demande",
          },
          limit: 20,
        },
      },
      {
        id: "table_departures",
        type: "table",
        label: "Départs du jour",
        dataRef: "pms_departures",
        layout: { col: 2, row: 1 },
        props: {
          columns: ["guestName", "room", "lateCheckout"],
          labels: {
            guestName: "Guest",
            room: "Chambre",
            lateCheckout: "Late checkout",
          },
          limit: 20,
        },
      },
      {
        id: "bar_revenue_source",
        type: "bar",
        label: "Revenue par source",
        dataRef: "pms_revenue",
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
      maxTokens: 600,
      style: "operational",
    },
    refresh: {
      mode: "scheduled",
      cron: "0 6 * * *",
      cooldownHours: 0,
    },
    cacheTTL: { raw: 300, transform: 600, render: 1800 },
    createdAt: now,
    updatedAt: now,
  };
}

export const HOSPITALITY_DAILY_BRIEF_REQUIRED_APPS = ["pms"] as const;

/**
 * Sample data generator — utilisé en démo (pas de connecteur PMS) et
 * potentiellement par les tests pour valider les blocks.
 */
export function buildHospitalityDailyBriefSampleData() {
  return {
    pms_arrivals: getMockArrivals(),
    pms_departures: getMockDepartures(),
    pms_revenue: getMockRevenueBySource(),
    pms_kpi_snapshot: [getMockKpiSnapshot()],
  };
}

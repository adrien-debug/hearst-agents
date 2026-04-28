/**
 * Founder Cockpit — vue d'ensemble cross-app pour fondateur.
 *
 * Sources : Stripe (revenus), HubSpot (pipeline), Gmail (réponses en attente),
 * Calendar (semaine), GitHub (vélocité dev). Toutes optionnelles : si une app
 * n'est pas connectée le block s'affiche vide.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const FOUNDER_COCKPIT_ID = "00000000-0000-4000-8000-100000000001";

export function buildFounderCockpit(scope: ReportSpec["scope"]): ReportSpec {
  const now = Date.now();

  return {
    id: FOUNDER_COCKPIT_ID,
    version: 1,
    meta: {
      title: "Founder Cockpit",
      summary:
        "MRR, pipeline ouvert, backlog email, semaine à venir, vélocité commits.",
      domain: "founder",
      persona: "founder",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "stripe_charges",
        kind: "composio",
        spec: { action: "STRIPE_LIST_CHARGES", params: { limit: 100 } },
      },
      {
        id: "hubspot_deals",
        kind: "composio",
        spec: { action: "HUBSPOT_LIST_DEALS", params: { limit: 100 } },
      },
      {
        id: "gmail_recent",
        kind: "native_google",
        spec: { service: "gmail", op: "messages.list", params: { limit: 50 } },
      },
      {
        id: "calendar_week",
        kind: "native_google",
        spec: {
          service: "calendar",
          op: "events.upcoming",
          params: { days: 7, limit: 30 },
        },
      },
      {
        id: "github_commits",
        kind: "composio",
        spec: { action: "GITHUB_LIST_COMMITS", params: { since: "7d" } },
      },
    ],
    transforms: [
      {
        id: "mrr_total",
        op: "groupBy",
        inputs: ["stripe_charges"],
        params: {
          by: ["currency"],
          measures: [{ name: "mrr", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "pipeline_total",
        op: "groupBy",
        inputs: ["hubspot_deals"],
        params: {
          by: [],
          measures: [{ name: "pipeline_value", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "unread_count",
        op: "groupBy",
        inputs: ["gmail_recent"],
        params: {
          by: [],
          measures: [{ name: "n_unread", fn: "count" }],
        },
      },
      {
        id: "commits_by_day",
        op: "groupBy",
        inputs: ["github_commits"],
        params: {
          by: ["date"],
          measures: [{ name: "n", fn: "count" }],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_mrr",
        type: "kpi",
        label: "MRR",
        dataRef: "mrr_total",
        layout: { col: 1, row: 0 },
        props: { field: "mrr", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_pipeline",
        type: "kpi",
        label: "Pipeline ouvert",
        dataRef: "pipeline_total",
        layout: { col: 1, row: 0 },
        props: { field: "pipeline_value", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_inbox",
        type: "kpi",
        label: "Emails en attente",
        dataRef: "unread_count",
        layout: { col: 1, row: 0 },
        props: { field: "n_unread", format: "number" },
      },
      {
        id: "kpi_commits",
        type: "kpi",
        label: "Commits 7j",
        dataRef: "commits_by_day",
        layout: { col: 1, row: 0 },
        props: { field: "n", format: "number" },
      },
      {
        id: "spark_commits",
        type: "sparkline",
        label: "Vélocité commits",
        dataRef: "commits_by_day",
        layout: { col: 2, row: 1 },
        props: { field: "n", height: 64 },
      },
      {
        id: "table_calendar",
        type: "table",
        label: "Semaine à venir",
        dataRef: "calendar_week",
        layout: { col: 2, row: 1 },
        props: {
          columns: ["summary", "start"],
          labels: { summary: "Événement", start: "Début" },
          formats: { start: "date" },
          limit: 10,
        },
      },
    ],
    narration: {
      mode: "intro+bullets",
      target: "focal_body",
      maxTokens: 600,
      style: "executive",
    },
    refresh: {
      mode: "manual",
      cooldownHours: 0,
    },
    cacheTTL: { raw: 300, transform: 600, render: 1800 },
    createdAt: now,
    updatedAt: now,
  };
}

export const FOUNDER_COCKPIT_REQUIRED_APPS = [
  "stripe",
  "hubspot",
  "gmail",
  "calendar",
  "github",
] as const;

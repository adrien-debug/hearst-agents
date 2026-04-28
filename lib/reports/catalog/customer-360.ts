/**
 * Customer 360 — vue unifiée d'un client à partir de l'email.
 *
 * Fusionne HubSpot (CRM), Stripe (paiements), Intercom (support), Gmail
 * (échanges). L'email cible est passé en paramètre via le scope/inputs.
 *
 * V1 : pas encore d'input dynamique côté API — on utilisera une variante
 * paramétrée en V1.5 (`runReport` avec `userInputs`). Pour l'instant le user
 * doit éditer le Spec dans le canvas pour changer l'email.
 */

import type { ReportSpec } from "@/lib/reports/spec/schema";

export const CUSTOMER_360_ID = "00000000-0000-4000-8000-100000000002";

export function buildCustomer360(
  scope: ReportSpec["scope"],
  customerEmail: string,
): ReportSpec {
  const now = Date.now();

  return {
    id: CUSTOMER_360_ID,
    version: 1,
    meta: {
      title: `Customer 360 — ${customerEmail}`,
      summary:
        "LTV, plan actuel, dernière interaction, tickets ouverts, timeline.",
      domain: "crm",
      persona: "csm",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope,
    sources: [
      {
        id: "hubspot_contact",
        kind: "composio",
        spec: {
          action: "HUBSPOT_GET_CONTACT_BY_EMAIL",
          params: { email: customerEmail },
        },
      },
      {
        id: "stripe_customer",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_CUSTOMERS",
          params: { email: customerEmail, limit: 1 },
        },
      },
      {
        id: "stripe_charges",
        kind: "composio",
        spec: {
          action: "STRIPE_LIST_CHARGES",
          params: { customer_email: customerEmail, limit: 100 },
        },
      },
      {
        id: "intercom_conversations",
        kind: "composio",
        spec: {
          action: "INTERCOM_LIST_CONVERSATIONS",
          params: { user_email: customerEmail, limit: 25 },
        },
      },
      {
        id: "gmail_threads",
        kind: "native_google",
        spec: {
          service: "gmail",
          op: "messages.list",
          params: { query: `from:${customerEmail} OR to:${customerEmail}`, limit: 25 },
        },
      },
    ],
    transforms: [
      {
        id: "ltv_total",
        op: "groupBy",
        inputs: ["stripe_charges"],
        params: {
          by: [],
          measures: [{ name: "ltv", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "open_tickets",
        op: "filter",
        inputs: ["intercom_conversations"],
        params: { where: "state == 'open'" },
      },
      {
        id: "open_tickets_count",
        op: "groupBy",
        inputs: ["open_tickets"],
        params: {
          by: [],
          measures: [{ name: "n", fn: "count" }],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_ltv",
        type: "kpi",
        label: "Lifetime Value",
        dataRef: "ltv_total",
        layout: { col: 1, row: 0 },
        props: { field: "ltv", format: "currency", currency: "EUR", compact: true },
      },
      {
        id: "kpi_tickets",
        type: "kpi",
        label: "Tickets ouverts",
        dataRef: "open_tickets_count",
        layout: { col: 1, row: 0 },
        props: { field: "n", format: "number" },
      },
      {
        id: "kpi_emails",
        type: "kpi",
        label: "Échanges email",
        dataRef: "gmail_threads",
        layout: { col: 1, row: 0 },
        props: { field: "_count", format: "number" },
      },
      {
        id: "kpi_charges",
        type: "kpi",
        label: "Paiements",
        dataRef: "stripe_charges",
        layout: { col: 1, row: 0 },
        props: { field: "_count", format: "number" },
      },
      {
        id: "table_payments",
        type: "table",
        label: "Historique paiements",
        dataRef: "stripe_charges",
        layout: { col: 4, row: 1 },
        props: {
          columns: ["created_at", "amount", "currency", "status"],
          labels: {
            created_at: "Date",
            amount: "Montant",
            currency: "Devise",
            status: "Statut",
          },
          formats: { created_at: "date", amount: "currency" },
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
      mode: "manual",
      cooldownHours: 0,
    },
    cacheTTL: { raw: 600, transform: 1200, render: 3600 },
    createdAt: now,
    updatedAt: now,
  };
}

export const CUSTOMER_360_REQUIRED_APPS = [
  "hubspot",
  "stripe",
  "intercom",
  "gmail",
] as const;

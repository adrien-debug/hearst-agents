/**
 * CRM Agent — Specialized agent for customer relationship operations
 *
 * Architecture Finale alignment: lib/agents/specialized/crm.ts
 * Domain: HubSpot, Salesforce, Pipedrive...
 * Current: HubSpot implementation
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { StepActor } from "@/lib/engine/runtime/engine/types";
import { routeConnectorRequest } from "@/lib/connectors/router";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────

export interface CRMAgentInput {
  operation: "list_contacts" | "get_contact" | "search_contacts" | "list_companies" | "get_company" | "list_deals" | "get_deal" | "summarize";
  params?: {
    id?: string;
    query?: string;
    limit?: number;
    email?: string;
  };
}

export interface CRMAgentOutput {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
  operation: string;
  meta: {
    latencyMs: number;
    source: "crm-pack" | "cache" | "none";
    recordCount?: number;
  };
}

export interface ContactSummary {
  totalCount: number;
  withEmail: number;
  withCompany: number;
  recentCount: number; // Last 30 days
}

export interface DealSummary {
  totalCount: number;
  totalValue: number;
  openCount: number;
  wonCount: number;
  lostCount: number;
  averageValue: number;
}

// ── Service ──────────────────────────────────────────────────────

interface RouterContext { db: SupabaseClient; tenantId: string; userId: string; }

export async function executeCRMAgent(input: CRMAgentInput, context: RouterContext): Promise<CRMAgentOutput> {
  const start = Date.now();
  try {
    switch (input.operation) {
      case "list_contacts": return await listContacts(input, context, start);
      case "get_contact": return await getContact(input, context, start);
      case "search_contacts": return await searchContacts(input, context, start);
      case "list_companies": return await listCompanies(input, context, start);
      case "get_company": return await getCompany(input, context, start);
      case "list_deals": return await listDeals(input, context, start);
      case "get_deal": return await getDeal(input, context, start);
      case "summarize": return await summarizeCRM(context, start);
      default: return { success: false, error: `Unknown: ${input.operation}`, operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
  }
}

async function listContacts(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; email?: string; firstName?: string; lastName?: string; company?: string }>>("hubspot", "list", { resource: "contacts", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_contacts", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_contacts", meta: { latencyMs: Date.now() - t, source: "crm-pack", recordCount: r.data?.length } };
}

async function getContact(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_contact", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; email?: string; firstName?: string; lastName?: string; phone?: string; company?: string }>("hubspot", "get", { resource: "contact", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_contact", meta: { latencyMs: Date.now() - t, source: r.success ? "crm-pack" : "none" } };
}

async function searchContacts(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  if (!input.params?.query) return { success: false, error: "Query required", operation: "search_contacts", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; email?: string; firstName?: string; lastName?: string }>>("hubspot", "search", { query: input.params.query }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "search_contacts", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "search_contacts", meta: { latencyMs: Date.now() - t, source: "crm-pack", recordCount: r.data?.length } };
}

async function listCompanies(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string; domain?: string; industry?: string }>>("hubspot", "list", { resource: "companies", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_companies", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_companies", meta: { latencyMs: Date.now() - t, source: "crm-pack", recordCount: r.data?.length } };
}

async function getCompany(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_company", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; name: string; domain?: string; industry?: string; address?: string }>("hubspot", "get", { resource: "company", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_company", meta: { latencyMs: Date.now() - t, source: r.success ? "crm-pack" : "none" } };
}

async function listDeals(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string; amount?: number; stage?: string; status?: string }>>("hubspot", "list", { resource: "deals", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_deals", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_deals", meta: { latencyMs: Date.now() - t, source: "crm-pack", recordCount: r.data?.length } };
}

async function getDeal(input: CRMAgentInput, ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_deal", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; name: string; amount?: number; stage?: string; closeDate?: string }>("hubspot", "get", { resource: "deal", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_deal", meta: { latencyMs: Date.now() - t, source: r.success ? "crm-pack" : "none" } };
}

async function summarizeCRM(ctx: RouterContext, t: number): Promise<CRMAgentOutput> {
  const [contactsR, dealsR] = await Promise.all([
    routeConnectorRequest<Array<{ id: string; email?: string; company?: string; createdAt?: string }>>("hubspot", "list", { resource: "contacts", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string; amount?: number; status?: string }>>("hubspot", "list", { resource: "deals", limit: 100 }, ctx),
  ]);

  const contacts = contactsR.success ? contactsR.data || [] : [];
  const deals = dealsR.success ? dealsR.data || [] : [];

  const cs: ContactSummary = {
    totalCount: contacts.length,
    withEmail: contacts.filter((c: { email?: string }) => c.email).length,
    withCompany: contacts.filter((c: { company?: string }) => c.company).length,
    recentCount: contacts.filter((c: { createdAt?: string }) => c.createdAt && new Date(c.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
  };

  const ds: DealSummary = {
    totalCount: deals.length,
    totalValue: deals.reduce((s: number, d: { amount?: number }) => s + (d.amount || 0), 0),
    openCount: deals.filter((d: { status?: string }) => d.status === "open").length,
    wonCount: deals.filter((d: { status?: string }) => d.status === "won").length,
    lostCount: deals.filter((d: { status?: string }) => d.status === "lost").length,
    averageValue: deals.length > 0 ? deals.reduce((s: number, d: { amount?: number }) => s + (d.amount || 0), 0) / deals.length : 0,
  };

  const summary = `## Résumé CRM (HubSpot)\n\n### Contacts\n- **Total**: ${cs.totalCount}\n- **Avec email**: ${cs.withEmail}\n- **Avec entreprise**: ${cs.withCompany}\n- **Créés (30j)**: ${cs.recentCount}\n\n### Deals\n- **Total**: ${ds.totalCount}\n- **Valeur totale**: $${ds.totalValue.toFixed(2)}\n- **Ouverts**: ${ds.openCount}\n- **Gagnés**: ${ds.wonCount}\n- **Perdus**: ${ds.lostCount}\n- **Valeur moyenne**: $${ds.averageValue.toFixed(2)}`;

  return { success: true, data: { contacts: cs, deals: ds }, summary, operation: "summarize", meta: { latencyMs: Date.now() - t, source: "crm-pack", recordCount: contacts.length + deals.length } };
}

// ── Runtime Wrapper ─────────────────────────────────────────────

export async function executeCRMAgentInRuntime(
  engine: RunEngine,
  task: string,
): Promise<CRMAgentOutput> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: null,
    type: "delegate",
    actor: "CRM" as StepActor,
    title: `CRM: ${task.slice(0, 100)}`,
    input: { task },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: "CRM" as StepActor,
    title: `CRM: ${task.slice(0, 100)}`,
  });

  try {
    const input = parseTaskToCRMInput(task);
    const context = {
      db: engine.db,
      tenantId: engine.userId?.split("@")[1] || "default",
      userId: engine.userId || "system",
    };

    const result = await executeCRMAgent(input, context);

    if (result.success) {
      await engine.steps.complete(step.id, { output: result as unknown as Record<string, unknown> });
      engine.events.emit({ type: "step_completed", run_id: engine.id, step_id: step.id, agent: "CRM" as StepActor });
      if (result.summary) {
        engine.events.emit({ type: "text_delta", run_id: engine.id, delta: result.summary });
      }
    } else {
      await engine.steps.fail(step.id, { code: "CRM_ERROR", message: result.error || "Unknown", retryable: false });
      engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error: result.error || "Unknown" });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[CRMAgent] Fatal error on task "${task}":`, error);
    await engine.steps.fail(step.id, { code: "AGENT_FATAL", message: error, retryable: false });
    engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error });
    return { success: false, error, operation: "unknown", meta: { latencyMs: 0, source: "none" } };
  }
}

function parseTaskToCRMInput(task: string): CRMAgentInput {
  const t = task.toLowerCase();
  if (t.includes("résumé") || t.includes("summary") || t.includes("aperçu") || t.includes("overview")) {
    return { operation: "summarize" };
  }
  if (t.includes("deal") || t.includes("opportunité") || t.includes("affaire")) {
    return { operation: "list_deals", params: { limit: 10 } };
  }
  if (t.includes("company") || t.includes("entreprise") || t.includes("société")) {
    return { operation: "list_companies", params: { limit: 10 } };
  }
  if (t.includes("search") || t.includes("recherche") || t.includes("trouver")) {
    const query = t.replace(/.*(?:search|recherche|trouver)\s+/, "").split(" ")[0];
    return { operation: "search_contacts", params: { query: query || "test" } };
  }
  return { operation: "list_contacts", params: { limit: 10 } };
}

// ── Task Detection ─────────────────────────────────────────────

export function isCRMTask(task: string): boolean {
  const t = task.toLowerCase();
  const keywords = ["crm", "hubspot", "contact", "client", "deal", "opportunité", "company", "entreprise", "lead", "prospect"];
  return keywords.some(k => t.includes(k));
}

/**
 * Productivity Agent — Specialized agent for productivity/PM operations
 *
 * Architecture Finale alignment: lib/agents/specialized/productivity.ts
 * Domain: Notion, Trello, Asana, Monday...
 * Current: Notion implementation
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { StepActor } from "@/lib/engine/runtime/engine/types";
import { routeConnectorRequest } from "@/lib/connectors/router";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────

export interface ProductivityAgentInput {
  operation: "list_pages" | "get_page" | "search_pages" | "list_databases" | "get_database" | "query_database" | "list_users" | "summarize";
  params?: {
    id?: string;
    databaseId?: string;
    query?: string;
    limit?: number;
    filter?: unknown;
  };
}

export interface ProductivityAgentOutput {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
  operation: string;
  meta: {
    latencyMs: number;
    source: "productivity-pack" | "cache" | "none";
    recordCount?: number;
  };
}

export interface NotionSummary {
  pageCount: number;
  databaseCount: number;
  userCount: number;
  recentPages: number;
}

// ── Service ──────────────────────────────────────────────────────

interface RouterContext { db: SupabaseClient; tenantId: string; userId: string; }

export async function executeProductivityAgent(input: ProductivityAgentInput, context: RouterContext): Promise<ProductivityAgentOutput> {
  const start = Date.now();
  try {
    switch (input.operation) {
      case "list_pages": return await listPages(input, context, start);
      case "get_page": return await getPage(input, context, start);
      case "search_pages": return await searchPages(input, context, start);
      case "list_databases": return await listDatabases(input, context, start);
      case "get_database": return await getDatabase(input, context, start);
      case "query_database": return await queryDatabase(input, context, start);
      case "list_users": return await listUsers(context, start);
      case "summarize": return await summarizeProductivity(context, start);
      default: return { success: false, error: `Unknown: ${input.operation}`, operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
  }
}

async function listPages(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; title: string; url?: string; createdAt?: string }>>("notion", "list", { resource: "pages", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_pages", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_pages", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: r.data?.length } };
}

async function getPage(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_page", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; title: string; url?: string; content?: unknown }>("notion", "get", { resource: "page", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_page", meta: { latencyMs: Date.now() - t, source: r.success ? "productivity-pack" : "none" } };
}

async function searchPages(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  if (!input.params?.query) return { success: false, error: "Query required", operation: "search_pages", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; title: string; url?: string }>>("notion", "search", { query: input.params.query }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "search_pages", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "search_pages", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: r.data?.length } };
}

async function listDatabases(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; title: string; url?: string }>>("notion", "list", { resource: "databases", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_databases", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_databases", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: r.data?.length } };
}

async function getDatabase(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_database", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; title: string; properties?: unknown }>("notion", "get", { resource: "database", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_database", meta: { latencyMs: Date.now() - t, source: r.success ? "productivity-pack" : "none" } };
}

async function queryDatabase(input: ProductivityAgentInput, ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  if (!input.params?.databaseId) return { success: false, error: "databaseId required", operation: "query_database", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; title: string; properties?: unknown }>>("notion", "query", { databaseId: input.params.databaseId, filter: input.params?.filter }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "query_database", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "query_database", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: r.data?.length } };
}

async function listUsers(ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string; email?: string }>>("notion", "list", { resource: "users" }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_users", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_users", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: r.data?.length } };
}

async function summarizeProductivity(ctx: RouterContext, t: number): Promise<ProductivityAgentOutput> {
  const [pagesR, databasesR, usersR] = await Promise.all([
    routeConnectorRequest<Array<{ id: string }>>("notion", "list", { resource: "pages", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string }>>("notion", "list", { resource: "databases", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string }>>("notion", "list", { resource: "users" }, ctx),
  ]);

  const ns: NotionSummary = {
    pageCount: pagesR.success ? (pagesR.data || []).length : 0,
    databaseCount: databasesR.success ? (databasesR.data || []).length : 0,
    userCount: usersR.success ? (usersR.data || []).length : 0,
    recentPages: 0,
  };

  const summary = `## Résumé Notion\n\n### Pages\n- **Total**: ${ns.pageCount}\n\n### Bases de données\n- **Total**: ${ns.databaseCount}\n\n### Utilisateurs\n- **Total**: ${ns.userCount}`;

  return { success: true, data: ns, summary, operation: "summarize", meta: { latencyMs: Date.now() - t, source: "productivity-pack", recordCount: ns.pageCount + ns.databaseCount } };
}

// ── Runtime Wrapper ─────────────────────────────────────────────

export async function executeProductivityAgentInRuntime(
  engine: RunEngine,
  task: string,
): Promise<ProductivityAgentOutput> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: null,
    type: "delegate",
    actor: "Productivity" as StepActor,
    title: `Productivity: ${task.slice(0, 100)}`,
    input: { task },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: "Productivity" as StepActor,
    title: `Productivity: ${task.slice(0, 100)}`,
  });

  try {
    const input = parseTaskToProductivityInput(task);
    const context = {
      db: engine.db,
      tenantId: engine.userId?.split("@")[1] || "default",
      userId: engine.userId || "system",
    };

    const result = await executeProductivityAgent(input, context);

    if (result.success) {
      await engine.steps.complete(step.id, { output: result as unknown as Record<string, unknown> });
      engine.events.emit({ type: "step_completed", run_id: engine.id, step_id: step.id, agent: "Productivity" as StepActor });
      if (result.summary) {
        engine.events.emit({ type: "text_delta", run_id: engine.id, delta: result.summary });
      }
    } else {
      await engine.steps.fail(step.id, { code: "PRODUCTIVITY_ERROR", message: result.error || "Unknown", retryable: false });
      engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error: result.error || "Unknown" });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[ProductivityAgent] Fatal error on task "${task}":`, error);
    await engine.steps.fail(step.id, { code: "AGENT_FATAL", message: error, retryable: false });
    engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error });
    return { success: false, error, operation: "unknown", meta: { latencyMs: 0, source: "none" } };
  }
}

function parseTaskToProductivityInput(task: string): ProductivityAgentInput {
  const t = task.toLowerCase();
  if (t.includes("résumé") || t.includes("summary") || t.includes("aperçu") || t.includes("overview")) {
    return { operation: "summarize" };
  }
  if (t.includes("database") || t.includes("base de données") || t.includes("table")) {
    return { operation: "list_databases", params: { limit: 10 } };
  }
  if (t.includes("user") || t.includes("utilisateur") || t.includes("membre")) {
    return { operation: "list_users" };
  }
  if (t.includes("search") || t.includes("recherche") || t.includes("trouver")) {
    const query = t.replace(/.*(?:search|recherche|trouver)\s+/, "").split(" ")[0];
    return { operation: "search_pages", params: { query: query || "test" } };
  }
  return { operation: "list_pages", params: { limit: 10 } };
}

// ── Task Detection ─────────────────────────────────────────────

export function isProductivityTask(task: string): boolean {
  const t = task.toLowerCase();
  const keywords = ["notion", "page", "database", "base de données", "table", "user", "utilisateur", "document"];
  return keywords.some(k => t.includes(k));
}

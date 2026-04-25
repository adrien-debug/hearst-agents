/**
 * Design Agent — Specialized agent for design system operations
 *
 * Architecture Finale alignment: lib/agents/specialized/design.ts
 * Domain: Figma, Adobe XD, Sketch, Canva...
 * Current: Figma implementation
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { StepActor } from "@/lib/engine/runtime/engine/types";
import { routeConnectorRequest } from "@/lib/connectors/router";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────

export interface DesignAgentInput {
  operation: "list_files" | "get_file" | "search_files" | "list_projects" | "list_components" | "list_variables" | "get_comments" | "summarize";
  params?: {
    id?: string;
    fileKey?: string;
    query?: string;
    limit?: number;
  };
}

export interface DesignAgentOutput {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
  operation: string;
  meta: {
    latencyMs: number;
    source: "design-pack" | "cache" | "none";
    recordCount?: number;
  };
}

export interface FigmaSummary {
  fileCount: number;
  projectCount: number;
  componentCount: number;
  variableCount: number;
}

// ── Service ──────────────────────────────────────────────────────

interface RouterContext { db: SupabaseClient; tenantId: string; userId: string; }

export async function executeDesignAgent(input: DesignAgentInput, context: RouterContext): Promise<DesignAgentOutput> {
  const start = Date.now();
  try {
    switch (input.operation) {
      case "list_files": return await listFiles(input, context, start);
      case "get_file": return await getFile(input, context, start);
      case "search_files": return await searchFiles(input, context, start);
      case "list_projects": return await listProjects(input, context, start);
      case "list_components": return await listComponents(input, context, start);
      case "list_variables": return await listVariables(input, context, start);
      case "get_comments": return await getComments(input, context, start);
      case "summarize": return await summarizeDesign(context, start);
      default: return { success: false, error: `Unknown: ${input.operation}`, operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
  }
}

async function listFiles(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string; url?: string; lastModified?: string }>>("figma", "list", { resource: "files", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_files", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_files", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function getFile(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  if (!input.params?.id) return { success: false, error: "ID required", operation: "get_file", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; name: string; url?: string; components?: unknown[] }>("figma", "get", { resource: "file", id: input.params.id }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_file", meta: { latencyMs: Date.now() - t, source: r.success ? "design-pack" : "none" } };
}

async function searchFiles(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  if (!input.params?.query) return { success: false, error: "Query required", operation: "search_files", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; name: string; url?: string }>>("figma", "search", { query: input.params.query }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "search_files", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "search_files", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function listProjects(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string }>>("figma", "list", { resource: "projects", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_projects", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_projects", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function listComponents(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  if (!input.params?.fileKey) return { success: false, error: "fileKey required", operation: "list_components", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; name: string }>>("figma", "list", { resource: "components", fileKey: input.params.fileKey }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_components", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_components", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function listVariables(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  if (!input.params?.fileKey) return { success: false, error: "fileKey required", operation: "list_variables", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; name: string; value?: unknown }>>("figma", "get_variables", { fileKey: input.params.fileKey }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_variables", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_variables", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function getComments(input: DesignAgentInput, ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  if (!input.params?.fileKey) return { success: false, error: "fileKey required", operation: "get_comments", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; message: string; user?: string }>>("figma", "get_comments", { fileKey: input.params.fileKey }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "get_comments", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "get_comments", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: r.data?.length } };
}

async function summarizeDesign(ctx: RouterContext, t: number): Promise<DesignAgentOutput> {
  const [filesR, projectsR] = await Promise.all([
    routeConnectorRequest<Array<{ id: string; components?: unknown[] }>>("figma", "list", { resource: "files", limit: 50 }, ctx),
    routeConnectorRequest<Array<{ id: string }>>("figma", "list", { resource: "projects", limit: 20 }, ctx),
  ]);

  const files = filesR.success ? filesR.data || [] : [];
  const projects = projectsR.success ? projectsR.data || [] : [];

  const fs: FigmaSummary = {
    fileCount: files.length,
    projectCount: projects.length,
    componentCount: files.reduce((s: number, f: { components?: unknown[] }) => s + (f.components?.length || 0), 0),
    variableCount: 0,
  };

  const summary = `## Résumé Figma\n\n### Fichiers\n- **Total**: ${fs.fileCount}\n\n### Projets\n- **Total**: ${fs.projectCount}\n\n### Composants\n- **Estimé**: ${fs.componentCount} composants dans les fichiers`;

  return { success: true, data: fs, summary, operation: "summarize", meta: { latencyMs: Date.now() - t, source: "design-pack", recordCount: fs.fileCount + fs.projectCount } };
}

// ── Runtime Wrapper ─────────────────────────────────────────────

export async function executeDesignAgentInRuntime(
  engine: RunEngine,
  task: string,
): Promise<DesignAgentOutput> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: null,
    type: "delegate",
    actor: "Design" as StepActor,
    title: `Design: ${task.slice(0, 100)}`,
    input: { task },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: "Design" as StepActor,
    title: `Design: ${task.slice(0, 100)}`,
  });

  try {
    const input = parseTaskToDesignInput(task);
    const context = {
      db: engine.db,
      tenantId: engine.userId?.split("@")[1] || "default",
      userId: engine.userId || "system",
    };

    const result = await executeDesignAgent(input, context);

    if (result.success) {
      await engine.steps.complete(step.id, { output: result as unknown as Record<string, unknown> });
      engine.events.emit({ type: "step_completed", run_id: engine.id, step_id: step.id, agent: "Design" as StepActor });
      if (result.summary) {
        engine.events.emit({ type: "text_delta", run_id: engine.id, delta: result.summary });
      }
    } else {
      await engine.steps.fail(step.id, { code: "DESIGN_ERROR", message: result.error || "Unknown", retryable: false });
      engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error: result.error || "Unknown" });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[DesignAgent] Fatal error on task "${task}":`, error);
    await engine.steps.fail(step.id, { code: "AGENT_FATAL", message: error, retryable: false });
    engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error });
    return { success: false, error, operation: "unknown", meta: { latencyMs: 0, source: "none" } };
  }
}

function parseTaskToDesignInput(task: string): DesignAgentInput {
  const t = task.toLowerCase();
  if (t.includes("résumé") || t.includes("summary") || t.includes("aperçu") || t.includes("overview")) {
    return { operation: "summarize" };
  }
  if (t.includes("project") || t.includes("projet")) {
    return { operation: "list_projects", params: { limit: 10 } };
  }
  if (t.includes("component") || t.includes("composant")) {
    return { operation: "list_components", params: { fileKey: "default" } };
  }
  if (t.includes("variable") || t.includes("token") || t.includes("design token")) {
    return { operation: "list_variables", params: { fileKey: "default" } };
  }
  if (t.includes("comment") || t.includes("commentaire")) {
    return { operation: "get_comments", params: { fileKey: "default" } };
  }
  if (t.includes("search") || t.includes("recherche") || t.includes("trouver")) {
    const query = t.replace(/.*(?:search|recherche|trouver)\s+/, "").split(" ")[0];
    return { operation: "search_files", params: { query: query || "design" } };
  }
  return { operation: "list_files", params: { limit: 10 } };
}

// ── Task Detection ─────────────────────────────────────────────

export function isDesignTask(task: string): boolean {
  const t = task.toLowerCase();
  const keywords = ["figma", "design", "component", "composant", "variable", "token", "file", "projet", "project", "mockup"];
  return keywords.some(k => t.includes(k));
}

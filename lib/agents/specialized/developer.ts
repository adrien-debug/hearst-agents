/**
 * Developer Agent — Specialized agent for developer operations
 *
 * Architecture Finale alignment: lib/agents/specialized/developer.ts
 * Domain: GitHub, Jira, Linear...
 * Current: GitHub implementation
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { StepActor } from "@/lib/engine/runtime/engine/types";
import { routeConnectorRequest } from "@/lib/connectors/router";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────

export type DeveloperAgentInput = {
  operation: "list_repos" | "get_repo" | "list_issues" | "get_issue" | "list_pull_requests" | "get_pull_request" | "list_commits" | "search_code" | "search_issues" | "summarize";
  provider?: string;
  params?: Record<string, unknown>;
  userId: string;
  tenantId?: string;
};

export type DeveloperAgentOutput = {
  success: boolean;
  operation: string;
  data?: unknown;
  summary?: string;
  error?: string;
  meta: {
    latencyMs: number;
    source: "developer-pack" | "cache" | "none";
    recordCount?: number;
  };
};

export type RepoSummary = {
  totalRepos: number;
  recentlyUpdated: string[];
  topLanguages: string[];
};

export type IssueSummary = {
  open: number;
  closed: number;
  avgResolutionDays: number;
};

export type PullRequestSummary = {
  open: number;
  closed: number;
  merged: number;
  draft: number;
};

// ── Service ──────────────────────────────────────────────────────

interface RouterContext { db: SupabaseClient; tenantId: string; userId: string; }

export async function executeDeveloperAgent(input: DeveloperAgentInput, context: RouterContext): Promise<DeveloperAgentOutput> {
  const start = Date.now();
  try {
    switch (input.operation) {
      case "list_repos": return await listRepos(input, context, start);
      case "get_repo": return await getRepo(input, context, start);
      case "list_issues": return await listIssues(input, context, start);
      case "get_issue": return await getIssue(input, context, start);
      case "list_pull_requests": return await listPullRequests(input, context, start);
      case "get_pull_request": return await getPullRequest(input, context, start);
      case "list_commits": return await listCommits(input, context, start);
      case "search_code": return await searchCode(input, context, start);
      case "search_issues": return await searchIssues(input, context, start);
      case "summarize": return await summarizeDeveloper(context, start);
      default: return { success: false, error: `Unknown: ${input.operation}`, operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
    }
  } catch (err) {
    console.error("[DeveloperAgent] Error executing operation:", input.operation, err);
    return { success: false, error: err instanceof Error ? err.message : String(err), operation: input.operation, meta: { latencyMs: Date.now() - start, source: "none" } };
  }
}

async function listRepos(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const r = await routeConnectorRequest<Array<{ id: string; name: string; fullName?: string; language?: string; stars?: number }>>("github", "list", { resource: "repos", limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_repos", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_repos", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.length } };
}

async function getRepo(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  if (!owner || !repo) return { success: false, error: "owner and repo required", operation: "get_repo", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; name: string; fullName: string; description?: string; language?: string; stars?: number; forks?: number; openIssues?: number }>("github", "get", { resource: "repo", owner, repo }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_repo", meta: { latencyMs: Date.now() - t, source: r.success ? "developer-pack" : "none" } };
}

async function listIssues(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  if (!owner || !repo) return { success: false, error: "owner and repo required", operation: "list_issues", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; number: number; title: string; state: string; author?: { login: string } }>>("github", "list", { resource: "issues", owner, repo, limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_issues", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_issues", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.length } };
}

async function getIssue(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  const number = input.params?.number as number | undefined;
  if (!owner || !repo || !number) return { success: false, error: "owner, repo, and number required", operation: "get_issue", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; number: number; title: string; state: string; body?: string; author?: { login: string } }>("github", "get", { resource: "issue", owner, repo, number }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_issue", meta: { latencyMs: Date.now() - t, source: r.success ? "developer-pack" : "none" } };
}

async function listPullRequests(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  if (!owner || !repo) return { success: false, error: "owner and repo required", operation: "list_pull_requests", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ id: string; number: number; title: string; state: string; draft?: boolean; author?: { login: string } }>>("github", "list", { resource: "pull_requests", owner, repo, limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_pull_requests", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_pull_requests", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.length } };
}

async function getPullRequest(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  const number = input.params?.number as number | undefined;
  if (!owner || !repo || !number) return { success: false, error: "owner, repo, and number required", operation: "get_pull_request", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ id: string; number: number; title: string; state: string; draft?: boolean; body?: string; author?: { login: string } }>("github", "get", { resource: "pull_request", owner, repo, number }, ctx);
  return { success: r.success, data: r.data, error: r.error, operation: "get_pull_request", meta: { latencyMs: Date.now() - t, source: r.success ? "developer-pack" : "none" } };
}

async function listCommits(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const owner = input.params?.owner as string | undefined;
  const repo = input.params?.repo as string | undefined;
  if (!owner || !repo) return { success: false, error: "owner and repo required", operation: "list_commits", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<Array<{ sha: string; message: string; author?: { name: string; login?: string }; date?: string }>>("github", "list", { resource: "commits", owner, repo, limit: input.params?.limit ?? 10 }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "list_commits", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "list_commits", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.length } };
}

async function searchCode(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const query = input.params?.query as string | undefined;
  if (!query) return { success: false, error: "Query required", operation: "search_code", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ totalCount: number; items: Array<{ name: string; path: string; url: string; repository: { name: string; fullName: string } }> }>("github", "search", { resource: "code", query }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "search_code", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "search_code", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.items?.length } };
}

async function searchIssues(input: DeveloperAgentInput, ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const query = input.params?.query as string | undefined;
  if (!query) return { success: false, error: "Query required", operation: "search_issues", meta: { latencyMs: Date.now() - t, source: "none" } };
  const r = await routeConnectorRequest<{ totalCount: number; items: Array<{ id: string; number: number; title: string; state: string }> }>("github", "search", { resource: "issues", query }, ctx);
  if (!r.success) return { success: false, error: r.error, operation: "search_issues", meta: { latencyMs: Date.now() - t, source: "none" } };
  return { success: true, data: r.data, operation: "search_issues", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: r.data?.items?.length } };
}

async function summarizeDeveloper(ctx: RouterContext, t: number): Promise<DeveloperAgentOutput> {
  const [reposR, issuesR] = await Promise.all([
    routeConnectorRequest<Array<{ id: string; name: string; language?: string; updatedAt?: string }>>("github", "list", { resource: "repos", limit: 100 }, ctx),
    routeConnectorRequest<Array<{ id: string; state: string; createdAt?: string; closedAt?: string }>>("github", "search", { resource: "issues", query: "is:issue user:@me" }, ctx),
  ]);

  const repos = reposR.success ? reposR.data || [] : [];
  const issues = issuesR.success ? issuesR.data || [] : [];

  const languages = new Set<string>();
  repos.forEach((r: { language?: string }) => { if (r.language) languages.add(r.language); });

  const rs: RepoSummary = {
    totalRepos: repos.length,
    recentlyUpdated: repos.filter((r: { updatedAt?: string }) => r.updatedAt && new Date(r.updatedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).slice(0, 5).map((r: { name: string }) => r.name),
    topLanguages: Array.from(languages).slice(0, 5),
  };

  const closedIssues = issues.filter((i: { state?: string }) => i.state === "closed");
  const openIssues = issues.filter((i: { state?: string }) => i.state === "open");
  let avgDays = 0;
  if (closedIssues.length > 0) {
    const totalDays = closedIssues.reduce((sum: number, i: { createdAt?: string; closedAt?: string }) => {
      if (i.createdAt && i.closedAt) {
        return sum + (new Date(i.closedAt).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      }
      return sum;
    }, 0);
    avgDays = totalDays / closedIssues.length;
  }

  const is: IssueSummary = {
    open: openIssues.length,
    closed: closedIssues.length,
    avgResolutionDays: Math.round(avgDays),
  };

  const summary = `## Résumé Développeur (GitHub)\n\n### Repositories\n- **Total**: ${rs.totalRepos}\n- **Langages principaux**: ${rs.topLanguages.join(", ") || "N/A"}\n- **Récemment mis à jour**: ${rs.recentlyUpdated.join(", ") || "N/A"}\n\n### Issues\n- **Ouvertes**: ${is.open}\n- **Fermées**: ${is.closed}\n- **Résolution moyenne**: ${is.avgResolutionDays}j`;

  return { success: true, data: { repos: rs, issues: is }, summary, operation: "summarize", meta: { latencyMs: Date.now() - t, source: "developer-pack", recordCount: repos.length + issues.length } };
}

// ── Runtime Wrapper ─────────────────────────────────────────────

export async function executeDeveloperAgentInRuntime(
  engine: RunEngine,
  task: string,
): Promise<DeveloperAgentOutput> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: null,
    type: "delegate",
    actor: "DeveloperAgent" as StepActor,
    title: `Developer: ${task.slice(0, 100)}`,
    input: { task },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: "DeveloperAgent" as StepActor,
    title: `Developer: ${task.slice(0, 100)}`,
  });

  try {
    const input = parseTaskToDeveloperInput(task);
    const context = {
      db: engine.db,
      tenantId: engine.userId?.split("@")[1] || "default",
      userId: engine.userId || "system",
    };

    const result = await executeDeveloperAgent(input, context);

    if (result.success) {
      await engine.steps.complete(step.id, { output: result as unknown as Record<string, unknown> });
      engine.events.emit({ type: "step_completed", run_id: engine.id, step_id: step.id, agent: "DeveloperAgent" as StepActor });
      if (result.summary) {
        engine.events.emit({ type: "text_delta", run_id: engine.id, delta: result.summary });
      }
    } else {
      console.error("[DeveloperAgent] Step failed:", result.error);
      await engine.steps.fail(step.id, { code: "DEVELOPER_ERROR", message: result.error || "Unknown", retryable: false });
      engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error: result.error || "Unknown" });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[DeveloperAgent] Fatal error on task "${task}":`, error);
    await engine.steps.fail(step.id, { code: "AGENT_FATAL", message: error, retryable: false });
    engine.events.emit({ type: "step_failed", run_id: engine.id, step_id: step.id, error });
    return { success: false, error, operation: "unknown", meta: { latencyMs: 0, source: "none" } };
  }
}

function parseTaskToDeveloperInput(task: string): DeveloperAgentInput {
  const t = task.toLowerCase();

  // Summarize patterns
  if (t.includes("résumé") || t.includes("summary") || t.includes("aperçu") || t.includes("overview") || t.includes("vue d'ensemble")) {
    return { operation: "summarize", userId: "system" };
  }

  // Search code patterns
  if (t.includes("search code") || t.includes("cherche code") || t.includes("recherche code") || t.includes("code:")) {
    const queryMatch = task.match(/(?:search|cherche|recherche)\s+code\s+(.+)/i) || task.match(/code:\s*(.+)/i);
    return { operation: "search_code", params: { query: queryMatch?.[1]?.trim() || task }, userId: "system" };
  }

  // Search issues patterns
  if (t.includes("search issues") || t.includes("cherche issue") || t.includes("recherche issue")) {
    const queryMatch = task.match(/(?:search|cherche|recherche)\s+issues?\s+(.+)/i);
    return { operation: "search_issues", params: { query: queryMatch?.[1]?.trim() || task }, userId: "system" };
  }

  // Commits patterns
  if (t.includes("commit")) {
    const repoMatch = task.match(/(?:repo|repository)\s+(\S+)\/(\S+)/i);
    return { operation: "list_commits", params: { owner: repoMatch?.[1], repo: repoMatch?.[2] }, userId: "system" };
  }

  // Pull request patterns
  if (t.includes("pull request") || t.includes("pr") || t.includes("pullrequest")) {
    const prMatch = task.match(/#?(\d+)/);
    const repoMatch = task.match(/(\S+)\/(\S+)/);
    if (prMatch && repoMatch) {
      return { operation: "get_pull_request", params: { owner: repoMatch[1], repo: repoMatch[2], number: parseInt(prMatch[1], 10) }, userId: "system" };
    }
    if (repoMatch) {
      return { operation: "list_pull_requests", params: { owner: repoMatch[1], repo: repoMatch[2] }, userId: "system" };
    }
    return { operation: "list_pull_requests", params: { limit: 10 }, userId: "system" };
  }

  // Issue patterns
  if (t.includes("issue") || t.includes("ticket") || t.includes("bug")) {
    const issueMatch = task.match(/#?(\d+)/);
    const repoMatch = task.match(/(\S+)\/(\S+)/);
    if (issueMatch && repoMatch) {
      return { operation: "get_issue", params: { owner: repoMatch[1], repo: repoMatch[2], number: parseInt(issueMatch[1], 10) }, userId: "system" };
    }
    if (repoMatch) {
      return { operation: "list_issues", params: { owner: repoMatch[1], repo: repoMatch[2] }, userId: "system" };
    }
    return { operation: "list_issues", params: { limit: 10 }, userId: "system" };
  }

  // Repo patterns (default)
  const repoMatch = task.match(/(\S+)\/(\S+)/);
  if (repoMatch) {
    return { operation: "get_repo", params: { owner: repoMatch[1], repo: repoMatch[2] }, userId: "system" };
  }

  return { operation: "list_repos", params: { limit: 10 }, userId: "system" };
}

// ── Task Detection ─────────────────────────────────────────────

export function isDeveloperTask(task: string): boolean {
  const t = task.toLowerCase();
  const keywords = ["github", "repo", "repository", "issue", "pull request", "pr", "commit", "code", "jira", "linear", "developer", "dev", "branch", "merge", "fork", "clone", "push", "pull", "git"];
  return keywords.some(k => t.includes(k));
}

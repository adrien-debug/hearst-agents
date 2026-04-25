/**
 * Guard Advisor — suggests guard_policy adjustments based on analytics.
 *
 * Analyzes failure patterns and output validation results
 * to propose guard policy changes. Never auto-applies.
 * Returns suggestions that operators review and manually apply.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { AgentGuardPolicy } from "../engine/runtime/prompt-guard";
import type { FeedbackSignal } from "../analytics/feedback";

type DB = SupabaseClient<Database>;

export interface GuardSuggestion {
  agent_id: string;
  current_policy: AgentGuardPolicy;
  suggested_policy: AgentGuardPolicy;
  changes: string[];
  reason: string;
  confidence: "low" | "medium" | "high";
}

export async function suggestGuardPolicy(
  sb: DB,
  agentId: string,
): Promise<GuardSuggestion | null> {
  const { data: agent } = await sb
    .from("agents")
    .select("id, guard_policy")
    .eq("id", agentId)
    .single();

  if (!agent) return null;

  const currentPolicy = (agent.guard_policy ?? {}) as AgentGuardPolicy;

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recentTraces } = await sb
    .from("traces")
    .select("output_trust, status, error, kind")
    .eq("run_id", agentId)
    .gte("started_at", since);

  const { data: agentRuns } = await sb
    .from("runs")
    .select("id")
    .eq("agent_id", agentId)
    .gte("started_at", since);

  const runIds = (agentRuns ?? []).map((r) => r.id);
  let traces = recentTraces ?? [];

  if (traces.length === 0 && runIds.length > 0) {
    const { data: runTraces } = await sb
      .from("traces")
      .select("output_trust, status, error, kind")
      .in("run_id", runIds)
      .eq("kind", "llm_call");

    traces = runTraces ?? [];
  }

  if (traces.length < 5) return null;

  const llmTraces = traces.filter((t) => t.kind === "llm_call");
  if (llmTraces.length === 0) return null;

  const guardFailed = llmTraces.filter((t) => t.output_trust === "guard_failed").length;
  const totalLlm = llmTraces.length;
  const guardFailRate = totalLlm > 0 ? guardFailed / totalLlm : 0;

  const changes: string[] = [];
  const suggested: AgentGuardPolicy = { ...currentPolicy };

  if (guardFailRate > 0.3 && hasStrictPolicy(currentPolicy)) {
    if (currentPolicy.max_output_chars && currentPolicy.max_output_chars < 5000) {
      suggested.max_output_chars = Math.min(currentPolicy.max_output_chars * 2, 50000);
      changes.push(`Increase max_output_chars: ${currentPolicy.max_output_chars} → ${suggested.max_output_chars}`);
    }

    if (currentPolicy.min_output_chars && currentPolicy.min_output_chars > 50) {
      suggested.min_output_chars = Math.max(Math.floor(currentPolicy.min_output_chars / 2), 10);
      changes.push(`Decrease min_output_chars: ${currentPolicy.min_output_chars} → ${suggested.min_output_chars}`);
    }
  }

  if (guardFailRate < 0.02 && totalLlm > 20 && !hasStrictPolicy(currentPolicy)) {
    if (!currentPolicy.max_output_chars) {
      suggested.max_output_chars = 50000;
      changes.push("Add max_output_chars: 50000 (safety ceiling)");
    }
  }

  const failedTraces = llmTraces.filter((t) => t.status === "failed");
  const errorMessages = failedTraces.map((t) => t.error ?? "").filter(Boolean);

  const sensitivePatterns = errorMessages.filter((e) =>
    /password|secret|token|api.?key/i.test(e),
  );
  if (sensitivePatterns.length > 0 && !currentPolicy.blacklist?.length) {
    suggested.blacklist = ["password", "secret", "api_key", "token"];
    changes.push("Add blacklist: [password, secret, api_key, token] — sensitive content detected in errors");
  }

  if (changes.length === 0) return null;

  return {
    agent_id: agentId,
    current_policy: currentPolicy,
    suggested_policy: suggested,
    changes,
    reason: `Based on ${totalLlm} LLM traces (${guardFailed} guard failures, ${(guardFailRate * 100).toFixed(1)}% fail rate)`,
    confidence: guardFailRate > 0.3 ? "high" : guardFailRate > 0.1 ? "medium" : "low",
  };
}

export async function applyGuardSuggestion(
  sb: DB,
  agentId: string,
  policy: AgentGuardPolicy,
  opts?: { actor?: string; signal_id?: string },
): Promise<{ success: boolean; error?: string }> {
  const { data: current } = await sb
    .from("agents")
    .select("guard_policy")
    .eq("id", agentId)
    .single();

  const beforePolicy = current?.guard_policy ?? {};

  const { error } = await sb
    .from("agents")
    .update({ guard_policy: policy as unknown as Database["public"]["Tables"]["agents"]["Update"]["guard_policy"] })
    .eq("id", agentId);

  if (error) return { success: false, error: error.message };

  const { trackChange } = await import("./change-tracker");
  await trackChange(sb, {
    signal_id: opts?.signal_id,
    change_type: "guard_policy",
    target_id: agentId,
    target_type: "agent",
    before_value: beforePolicy,
    after_value: policy,
    actor: opts?.actor ?? "system",
    reason: "Guard policy applied from suggestion",
  });

  return { success: true };
}

export function guardSuggestionToSignal(suggestion: GuardSuggestion): FeedbackSignal {
  return {
    kind: "guard_policy",
    priority: suggestion.confidence === "high" ? "high" : "medium",
    target_id: suggestion.agent_id,
    target_type: "agent",
    title: `Guard policy adjustment suggested (${suggestion.changes.length} changes)`,
    description: suggestion.reason,
    suggestion: suggestion.changes.join("; "),
    data: {
      current_policy: suggestion.current_policy,
      suggested_policy: suggestion.suggested_policy,
      confidence: suggestion.confidence,
    },
  };
}

function hasStrictPolicy(policy: AgentGuardPolicy): boolean {
  return !!(
    policy.expect_json ||
    policy.min_output_chars ||
    policy.max_output_chars ||
    (policy.must_match && policy.must_match.length > 0) ||
    (policy.blacklist && policy.blacklist.length > 0)
  );
}

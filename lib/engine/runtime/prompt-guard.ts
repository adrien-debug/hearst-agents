/**
 * Prompt Guard — runtime validation of prompt artifacts and output trust.
 *
 * Pre-check: validates prompt artifact exists, is non-empty, matches scope.
 * Post-check: structure validation (JSON), size, regex/blacklist rules.
 * Output trust: classifies trace outputs by confidence level.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { RuntimeError } from "./lifecycle";

type DB = SupabaseClient<Database>;

export type OutputTrust = "verified" | "tool_backed" | "unverified" | "guard_failed" | "stubbed";

// ── Prompt Artifact Validation ────────────────────────────

export interface PromptValidation {
  valid: boolean;
  artifact_id: string;
  slug: string;
  version: number;
  content_hash: string;
  error?: string;
}

export async function validatePromptArtifact(
  sb: DB,
  artifactId: string,
): Promise<PromptValidation> {
  const { data, error } = await sb
    .from("prompt_artifacts")
    .select("id, slug, version, content, content_hash, kind")
    .eq("id", artifactId)
    .single();

  if (error || !data) {
    return {
      valid: false,
      artifact_id: artifactId,
      slug: "",
      version: 0,
      content_hash: "",
      error: `Prompt artifact ${artifactId} not found`,
    };
  }

  if (!data.content || data.content.trim().length === 0) {
    return {
      valid: false,
      artifact_id: data.id,
      slug: data.slug,
      version: data.version,
      content_hash: data.content_hash,
      error: `Prompt artifact "${data.slug}" v${data.version} has empty content`,
    };
  }

  return {
    valid: true,
    artifact_id: data.id,
    slug: data.slug,
    version: data.version,
    content_hash: data.content_hash,
  };
}

export async function loadPromptContent(
  sb: DB,
  artifactId: string,
): Promise<string> {
  const validation = await validatePromptArtifact(sb, artifactId);
  if (!validation.valid) {
    throw new RuntimeError("INVALID_INPUT", validation.error!);
  }

  const { data } = await sb
    .from("prompt_artifacts")
    .select("content")
    .eq("id", artifactId)
    .single();

  return data?.content ?? "";
}

// ── Output Trust Determination ────────────────────────────

export function determineOutputTrust(traceContext: {
  has_tool_backing: boolean;
  guard_passed: boolean;
  is_stub: boolean;
  has_error: boolean;
}): OutputTrust {
  if (traceContext.is_stub) return "stubbed";
  if (traceContext.has_error || !traceContext.guard_passed) return "guard_failed";
  if (traceContext.has_tool_backing) return "tool_backed";
  return "unverified";
}

// ── Guard Check Results ───────────────────────────────────

export interface GuardCheckResult {
  passed: boolean;
  reason?: string;
}

// ── Basic Guards ──────────────────────────────────────────

export function checkOutputBasicGuards(output: string): GuardCheckResult {
  if (!output || output.trim().length === 0) {
    return { passed: false, reason: "Empty output" };
  }

  if (output.length > 500_000) {
    return { passed: false, reason: "Output exceeds 500k chars — possible runaway generation" };
  }

  return { passed: true };
}

// ── JSON Structure Guard ─────────────────────────────────

export function checkJsonStructure(output: string): GuardCheckResult {
  try {
    JSON.parse(output);
    return { passed: true };
  } catch {
    return { passed: false, reason: "Output is not valid JSON" };
  }
}

// ── Size Guard ────────────────────────────────────────────

export function checkOutputSize(
  output: string,
  minChars?: number,
  maxChars?: number,
): GuardCheckResult {
  if (minChars !== undefined && output.length < minChars) {
    return { passed: false, reason: `Output too short: ${output.length} chars < min ${minChars}` };
  }
  if (maxChars !== undefined && output.length > maxChars) {
    return { passed: false, reason: `Output too long: ${output.length} chars > max ${maxChars}` };
  }
  return { passed: true };
}

// ── Regex Guard ───────────────────────────────────────────

export function checkOutputRegex(
  output: string,
  mustMatch?: RegExp[],
  mustNotMatch?: RegExp[],
): GuardCheckResult {
  if (mustMatch) {
    for (const re of mustMatch) {
      if (!re.test(output)) {
        return { passed: false, reason: `Output does not match required pattern: ${re.source}` };
      }
    }
  }
  if (mustNotMatch) {
    for (const re of mustNotMatch) {
      if (re.test(output)) {
        return { passed: false, reason: `Output matches forbidden pattern: ${re.source}` };
      }
    }
  }
  return { passed: true };
}

// ── Blacklist Guard ───────────────────────────────────────

export function checkOutputBlacklist(
  output: string,
  blacklist: string[],
): GuardCheckResult {
  const lower = output.toLowerCase();
  for (const term of blacklist) {
    if (lower.includes(term.toLowerCase())) {
      return { passed: false, reason: `Output contains blacklisted term: "${term}"` };
    }
  }
  return { passed: true };
}

// ── Agent Guard Policy ────────────────────────────────────

export interface AgentGuardPolicy {
  expect_json?: boolean;
  min_output_chars?: number;
  max_output_chars?: number;
  must_match?: string[];
  must_not_match?: string[];
  blacklist?: string[];
}

export interface PolicyCheckResult {
  passed: boolean;
  checks: { guard: string; passed: boolean; reason?: string }[];
}

export function applyAgentGuardPolicy(
  output: string,
  policy: AgentGuardPolicy,
): PolicyCheckResult {
  const checks: { guard: string; passed: boolean; reason?: string }[] = [];
  let allPassed = true;

  const basic = checkOutputBasicGuards(output);
  checks.push({ guard: "basic", ...basic });
  if (!basic.passed) allPassed = false;

  if (policy.expect_json) {
    const json = checkJsonStructure(output);
    checks.push({ guard: "json_structure", ...json });
    if (!json.passed) allPassed = false;
  }

  if (policy.min_output_chars !== undefined || policy.max_output_chars !== undefined) {
    const size = checkOutputSize(output, policy.min_output_chars, policy.max_output_chars);
    checks.push({ guard: "output_size", ...size });
    if (!size.passed) allPassed = false;
  }

  if (policy.must_match || policy.must_not_match) {
    const mustMatch = policy.must_match?.map((s) => new RegExp(s, "i"));
    const mustNotMatch = policy.must_not_match?.map((s) => new RegExp(s, "i"));
    const regex = checkOutputRegex(output, mustMatch, mustNotMatch);
    checks.push({ guard: "regex", ...regex });
    if (!regex.passed) allPassed = false;
  }

  if (policy.blacklist && policy.blacklist.length > 0) {
    const bl = checkOutputBlacklist(output, policy.blacklist);
    checks.push({ guard: "blacklist", ...bl });
    if (!bl.passed) allPassed = false;
  }

  return { passed: allPassed, checks };
}

/**
 * Output Validation Layer — classify and score trace outputs.
 *
 * Runs all applicable guards and produces a structured verdict.
 * Can be called after any trace to enrich output_trust.
 */

import type { OutputTrust, AgentGuardPolicy, PolicyCheckResult } from "./prompt-guard";
import {
  checkOutputBasicGuards,
  applyAgentGuardPolicy,
  determineOutputTrust,
} from "./prompt-guard";

export type OutputClassification = "valid" | "invalid" | "suspect";

export interface OutputValidationResult {
  classification: OutputClassification;
  trust: OutputTrust;
  score: number;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  failed_guards: string[];
  policy_result?: PolicyCheckResult;
}

export function validateOutput(
  output: string,
  context: {
    has_tool_backing?: boolean;
    is_stub?: boolean;
    policy?: AgentGuardPolicy;
  } = {},
): OutputValidationResult {
  const basicCheck = checkOutputBasicGuards(output);

  if (!basicCheck.passed) {
    return {
      classification: "invalid",
      trust: "guard_failed",
      score: 0,
      checks_total: 1,
      checks_passed: 0,
      checks_failed: 1,
      failed_guards: ["basic"],
    };
  }

  if (context.is_stub) {
    return {
      classification: "valid",
      trust: "stubbed",
      score: 1,
      checks_total: 1,
      checks_passed: 1,
      checks_failed: 0,
      failed_guards: [],
    };
  }

  if (context.policy) {
    const policyResult = applyAgentGuardPolicy(output, context.policy);
    const failedGuards = policyResult.checks
      .filter((c) => !c.passed)
      .map((c) => c.guard);

    const checksTotal = policyResult.checks.length;
    const checksPassed = policyResult.checks.filter((c) => c.passed).length;
    const score = checksTotal > 0 ? checksPassed / checksTotal : 1;

    let classification: OutputClassification;
    if (policyResult.passed) {
      classification = "valid";
    } else if (score >= 0.5) {
      classification = "suspect";
    } else {
      classification = "invalid";
    }

    const trust = determineOutputTrust({
      has_tool_backing: context.has_tool_backing ?? false,
      guard_passed: policyResult.passed,
      is_stub: false,
      has_error: false,
    });

    return {
      classification,
      trust,
      score: Math.round(score * 1000) / 1000,
      checks_total: checksTotal,
      checks_passed: checksPassed,
      checks_failed: checksTotal - checksPassed,
      failed_guards: failedGuards,
      policy_result: policyResult,
    };
  }

  const trust = determineOutputTrust({
    has_tool_backing: context.has_tool_backing ?? false,
    guard_passed: true,
    is_stub: false,
    has_error: false,
  });

  return {
    classification: "valid",
    trust,
    score: 1,
    checks_total: 1,
    checks_passed: 1,
    checks_failed: 0,
    failed_guards: [],
  };
}

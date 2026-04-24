/**
 * Planner Domain Model — Execution plans for HEARST OS.
 *
 * An ExecutionPlan sits above the existing Plan/ActionPlan system
 * (lib/plans/types.ts) and bridges user intent → structured execution.
 *
 * Separation of concerns:
 * - Planner decides WHAT to do (steps, dependencies, approval gates)
 * - Resolver decides WITH WHAT (provider selection at execution time)
 * - Executor decides NOW (step-by-step runtime)
 *
 * The plan is real in architecture but invisible in UX.
 * The user feels the OS understands, prepares, and acts.
 */

import type { ProviderId } from "@/lib/providers/types";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";

// ── Plan status lifecycle ───────────────────────────────────

export type PlanStatus =
  | "draft"
  | "ready"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "degraded";

// ── Step kinds ──────────────────────────────────────────────

export type PlanStepKind =
  | "read"
  | "analyze"
  | "synthesize"
  | "generate_asset"
  | "deliver"
  | "schedule"
  | "monitor"
  | "wait_for_approval";

export type PlanStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "done"
  | "failed"
  | "skipped";

export type StepRisk = "low" | "medium" | "high";

// ── Plan step ───────────────────────────────────────────────

export interface ExecutionPlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  /** Capability needed — provider resolved at execution time, not planning time. */
  capability?: ConnectorCapability;
  /** Tool to invoke — optional, may be inferred from capability. */
  tool?: string;
  /** Provider — only set if forced or post-resolution. Never set at planning time unless forced. */
  providerId?: ProviderId;
  /** IDs of steps that must complete before this one can run. */
  dependsOn: string[];
  risk: StepRisk;
  /** What this step should produce. */
  expectedOutput?: string;
  status: PlanStepStatus;
  /** Runtime result after execution. */
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ── Execution plan types ────────────────────────────────────

export type ExecutionPlanType = "one_shot" | "mission" | "monitoring";

// ── Execution plan ──────────────────────────────────────────

export interface ExecutionPlan {
  id: string;
  threadId: string;
  /** Scope pour isolation multi-tenant */
  userId: string;
  tenantId: string;
  workspaceId: string;
  intent: string;
  type: ExecutionPlanType;
  status: PlanStatus;
  steps: ExecutionPlanStep[];
  requiresApproval: boolean;
  /** Which step is the approval gate, if any. */
  approvalStepId?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Mission definition (V2) ────────────────────────────────

export type MissionMode = "recurring" | "monitoring";
export type MissionStatus = "draft" | "active" | "paused" | "completed";

export interface MissionDefinition {
  id: string;
  threadId: string;
  /** Scope pour isolation multi-tenant */
  userId: string;
  tenantId: string;
  workspaceId: string;
  sourcePlanId: string;
  mode: MissionMode;
  naturalLanguageRule: string;
  schedule?: string;
  condition?: string;
  status: MissionStatus;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ── Plan creation input ─────────────────────────────────────

export interface PlanIntent {
  intent: string;
  threadId: string;
  userId: string;
  tenantId: string;
  workspaceId?: string;
  /** If the user specified a provider explicitly. */
  forcedProviderId?: ProviderId;
  /** Clarification context from previous chat turns. */
  clarifications?: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────────────

export function isPlanTerminal(status: PlanStatus): boolean {
  return status === "completed" || status === "failed";
}

export function isStepTerminal(status: PlanStepStatus): boolean {
  return status === "done" || status === "failed" || status === "skipped";
}

export function hasApprovalGate(plan: ExecutionPlan): boolean {
  return plan.steps.some((s) => s.kind === "wait_for_approval");
}

export function getReadySteps(plan: ExecutionPlan): ExecutionPlanStep[] {
  const doneIds = new Set(
    plan.steps.filter((s) => s.status === "done").map((s) => s.id),
  );
  return plan.steps.filter((s) => {
    if (s.status !== "pending") return false;
    return s.dependsOn.every((dep) => doneIds.has(dep));
  });
}

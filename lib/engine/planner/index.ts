/**
 * Planner — Converts user intent into structured ExecutionPlans.
 *
 * The planner is the cognitive layer between chat and execution.
 * It does NOT choose providers (that's the resolver's job).
 * It does NOT execute (that's the executor's job).
 *
 * It decides:
 * - What steps are needed
 * - What capabilities each step requires
 * - Which steps depend on others
 * - Whether approval is needed
 * - Whether this is a one-shot, mission, or monitoring flow
 */

import type {
  ExecutionPlan,
  ExecutionPlanStep,
  ExecutionPlanType,
  PlanIntent,
  PlanStepKind,
  StepRisk,
} from "./types";
import { getReadySteps } from "./types";
import { savePlan, getPlan } from "./store";
import { logPlanEvent } from "./debug";

// ── Intent classification ───────────────────────────────────

const MISSION_PATTERNS = /\b(chaque|every|tous les|weekly|daily|hourly|récurrent|recurring|schedule|planifie|automatise)\b/i;
const MONITORING_PATTERNS = /\b(surveille|monitor|watch|alert|préviens|notifie|quand|when|if.*then|dès que)\b/i;
const HIGH_RISK_PATTERNS = /\b(supprime|delete|remove|envoie|send|publie|publish|paie|pay|transfer)\b/i;
const APPROVAL_PATTERNS = /\b(vérifie avant|check before|confirm|confirme|valide|approve|review)\b/i;

function classifyPlanType(intent: string): ExecutionPlanType {
  if (MISSION_PATTERNS.test(intent)) return "mission";
  if (MONITORING_PATTERNS.test(intent)) return "monitoring";
  return "one_shot";
}

function needsApproval(intent: string, steps: ExecutionPlanStep[]): boolean {
  if (APPROVAL_PATTERNS.test(intent)) return true;
  return steps.some((s) => s.risk === "high");
}

function assessRisk(kind: PlanStepKind, intent: string): StepRisk {
  if (kind === "deliver" && HIGH_RISK_PATTERNS.test(intent)) return "high";
  if (kind === "generate_asset") return "medium";
  if (kind === "schedule") return "medium";
  return "low";
}

// ── Step inference from intent ──────────────────────────────

interface InferredStep {
  kind: PlanStepKind;
  title: string;
  capability?: string;
  tool?: string;
  expectedOutput?: string;
}

function inferSteps(intent: string, type: ExecutionPlanType): InferredStep[] {
  const lower = intent.toLowerCase();
  const steps: InferredStep[] = [];

  // Read phase — gather data
  if (/\b(résume|summarize|messages?|emails?|inbox|boîte)\b/.test(lower)) {
    steps.push({ kind: "read", title: "Lecture des messages", capability: "messaging", expectedOutput: "raw_messages" });
  }
  if (/\b(agenda|calendar|réunion|meeting|événement|event)\b/.test(lower)) {
    steps.push({ kind: "read", title: "Lecture de l'agenda", capability: "calendar", expectedOutput: "calendar_events" });
  }
  if (/\b(fichier|file|document|drive)\b/.test(lower)) {
    steps.push({ kind: "read", title: "Lecture des fichiers", capability: "files", expectedOutput: "file_list" });
  }
  if (/\b(recherche|search|web|find|trouve)\b/.test(lower)) {
    steps.push({ kind: "read", title: "Recherche", capability: "research", expectedOutput: "search_results" });
  }

  // Analyze phase
  if (steps.length > 0 || /\b(analyse|analyze|compare|évalue|assess)\b/.test(lower)) {
    steps.push({ kind: "analyze", title: "Analyse", expectedOutput: "analysis" });
  }

  // Synthesize phase
  if (/\b(résume|summarize|synthèse|brief|rapport|report)\b/.test(lower)) {
    steps.push({ kind: "synthesize", title: "Synthèse", expectedOutput: "summary" });
  }

  // Generate asset phase
  if (/\b(rapport|report|pdf|excel|xlsx|document)\b/.test(lower)) {
    steps.push({ kind: "generate_asset", title: "Génération du livrable", expectedOutput: "asset" });
  }

  // Deliver phase
  if (/\b(envoie|send|reply|répond|forward|transmet)\b/.test(lower)) {
    steps.push({ kind: "deliver", title: "Envoi", capability: "messaging_send", tool: "send_message", expectedOutput: "delivery_confirmation" });
  }

  // Schedule phase (for missions)
  if (type === "mission") {
    steps.push({ kind: "schedule", title: "Planification récurrente", expectedOutput: "mission_scheduled" });
  }

  // Monitor phase (for monitoring)
  if (type === "monitoring") {
    steps.push({ kind: "monitor", title: "Surveillance active", expectedOutput: "monitoring_active" });
  }

  // Fallback: if no steps inferred, create a basic analyze + synthesize
  if (steps.length === 0) {
    steps.push({ kind: "analyze", title: "Analyse de la demande", expectedOutput: "analysis" });
    steps.push({ kind: "synthesize", title: "Réponse", expectedOutput: "response" });
  }

  return steps;
}

// ── Plan creation ───────────────────────────────────────────

let planCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++planCounter}`;
}

export function createPlanFromIntent(input: PlanIntent): ExecutionPlan {
  const type = classifyPlanType(input.intent);
  const inferred = inferSteps(input.intent, type);

  // POURQUOI : `dependsOn` est rempli en deuxième passe (boucle ci-dessous)
  // car les IDs des steps précédents ne sont pas connus pendant le map.
  const steps: ExecutionPlanStep[] = inferred.map((s) => {
    const id = generateId("step");
    const risk = assessRisk(s.kind, input.intent);
    return {
      id,
      kind: s.kind,
      title: s.title,
      capability: s.capability as ExecutionPlanStep["capability"],
      tool: s.tool,
      providerId: input.forcedProviderId,
      dependsOn: [],
      risk,
      expectedOutput: s.expectedOutput,
      status: "pending" as const,
    };
  });

  // Fix dependsOn — use actual generated IDs
  for (let i = 1; i < steps.length; i++) {
    steps[i].dependsOn = [steps[i - 1].id];
  }

  const approval = needsApproval(input.intent, steps);

  // Insert approval gate before first high-risk step
  if (approval) {
    const firstHighRisk = steps.findIndex((s) => s.risk === "high");
    const insertAt = firstHighRisk >= 0 ? firstHighRisk : steps.length - 1;
    const gateId = generateId("gate");
    const gate: ExecutionPlanStep = {
      id: gateId,
      kind: "wait_for_approval",
      title: "Validation requise",
      dependsOn: insertAt > 0 ? [steps[insertAt - 1].id] : [],
      risk: "low",
      status: "pending",
    };
    steps.splice(insertAt, 0, gate);
    // Repoint the step after the gate
    if (insertAt + 1 < steps.length) {
      steps[insertAt + 1].dependsOn = [gateId];
    }
  }

  const plan: ExecutionPlan = {
    id: generateId("plan"),
    threadId: input.threadId,
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId ?? "default",
    intent: input.intent,
    type,
    status: "draft",
    steps,
    requiresApproval: approval,
    approvalStepId: approval ? steps.find((s) => s.kind === "wait_for_approval")?.id : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  savePlan(plan);
  logPlanEvent("plan_created", { planId: plan.id, type, stepCount: steps.length, approval });

  return plan;
}

// ── Plan updates ────────────────────────────────────────────

export function updatePlanFromClarification(
  planId: string,
  clarifications: Record<string, string>,
): ExecutionPlan | null {
  const plan = getPlan(planId);
  if (!plan) return null;

  // Apply clarifications — e.g. specifying a target, schedule, or output kind
  if (clarifications.schedule && plan.type === "mission") {
    const scheduleStep = plan.steps.find((s) => s.kind === "schedule");
    if (scheduleStep) {
      scheduleStep.expectedOutput = clarifications.schedule;
    }
  }

  plan.updatedAt = Date.now();
  savePlan(plan);
  logPlanEvent("plan_clarified", { planId, clarifications });

  return plan;
}

export function markPlanAwaitingApproval(planId: string): ExecutionPlan | null {
  const plan = getPlan(planId);
  if (!plan) return null;

  plan.status = "awaiting_approval";
  plan.updatedAt = Date.now();
  savePlan(plan);
  logPlanEvent("plan_awaiting_approval", { planId });

  return plan;
}

export function approvePlan(planId: string): ExecutionPlan | null {
  const plan = getPlan(planId);
  if (!plan || plan.status !== "awaiting_approval") return null;

  const gate = plan.steps.find((s) => s.kind === "wait_for_approval" && s.status === "pending");
  if (gate) {
    gate.status = "done";
    gate.completedAt = Date.now();
  }

  plan.status = "executing";
  plan.updatedAt = Date.now();
  savePlan(plan);
  logPlanEvent("plan_approved", { planId });

  return plan;
}

// ── Step resolution ─────────────────────────────────────────

export function resolveNextExecutableSteps(planId: string): ExecutionPlanStep[] {
  const plan = getPlan(planId);
  if (!plan || plan.status === "completed" || plan.status === "failed") return [];
  return getReadySteps(plan);
}

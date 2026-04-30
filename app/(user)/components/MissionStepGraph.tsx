"use client";

/**
 * MissionStepGraph — Timeline verticale des steps d'un plan multi-step.
 *
 * Affiché au-dessus du contenu MissionStage quand un plan est en cours.
 * Header : intent + cost meter cumulé + ETA. Body : StepCards connectés
 * par un trait subtle. Status icons + couleurs par état.
 *
 * Tokens design system uniquement (cf. CLAUDE.md règles UI).
 */

import { StepCard } from "./StepCard";
import { useRuntimeStore, type PlanState } from "@/stores/runtime";

export interface MissionStepGraphProps {
  plan: PlanState;
  /** Optionnel : override sur l'approval handler. Sinon utilise le store. */
  onApprove?: (stepId: string) => void | Promise<void>;
  onSkip?: (stepId: string) => void | Promise<void>;
}

const STATUS_LABEL: Record<PlanState["status"], string> = {
  preview: "PREVIEW",
  running: "EN COURS",
  awaiting_approval: "VALIDATION",
  completed: "TERMINÉ",
  failed: "ÉCHEC",
};

function statusColor(status: PlanState["status"]): string {
  switch (status) {
    case "running":
    case "awaiting_approval":
      return "var(--cykan)";
    case "completed":
      return "var(--cykan)";
    case "failed":
      return "var(--danger)";
    case "preview":
    default:
      return "var(--text-faint)";
  }
}

function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd === 0) return "$0.00";
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

function estimateRemainingSecs(plan: PlanState): number | null {
  // Heuristique : 3s par step idle/awaiting, 0 sinon.
  const remaining = plan.steps.filter(
    (s) => s.status === "idle" || s.status === "awaiting_approval",
  ).length;
  if (remaining === 0) return null;
  return remaining * 3;
}

export function MissionStepGraph({ plan, onApprove, onSkip }: MissionStepGraphProps) {
  const approveStep = useRuntimeStore((s) => s.approveStep);

  const handleApprove = async (stepId: string) => {
    if (onApprove) {
      await onApprove(stepId);
      return;
    }
    await approveStep(plan.id, stepId);
  };

  const handleSkip = async (stepId: string) => {
    if (onSkip) {
      await onSkip(stepId);
      return;
    }
    // POURQUOI : skip = approve avec flag spécial. MVP on POST `skip=true`.
    try {
      await fetch(`/api/v2/missions/${plan.id}/approve-step`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, skip: true }),
      });
    } catch (err) {
      console.error("[MissionStepGraph] skip error:", err);
    }
  };

  const eta = estimateRemainingSecs(plan);
  const color = statusColor(plan.status);

  return (
    <section
      className="border border-[var(--border-shell)]"
      style={{
        background: "var(--bg-rail)",
        padding: "var(--space-4) var(--space-6)",
      }}
      data-testid="mission-step-graph"
      data-plan-id={plan.id}
      data-status={plan.status}
    >
      {/* Header : intent + status + cost meter */}
      <header
        className="flex items-start"
        style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
      >
        <div className="flex-1 min-w-0">
          <p
            className="t-9 font-mono uppercase tracking-display"
            style={{ color: "var(--text-l2)", marginBottom: "var(--space-1)" }}
          >
            Plan multi-step
          </p>
          <p className="t-15 font-light text-[var(--text)] whitespace-pre-wrap">
            {plan.intent || "Plan sans intention"}
          </p>
        </div>
        <div className="flex flex-col items-end" style={{ gap: "var(--space-1)" }}>
          <span
            className="t-9 font-mono uppercase tracking-marquee"
            style={{ color }}
          >
            {STATUS_LABEL[plan.status]}
          </span>
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {formatCost(plan.totalCostUsd)} / ~{formatCost(plan.estimatedCostUsd)}
          </span>
          {eta !== null && plan.status === "running" && (
            <span className="t-9 font-mono text-[var(--text-faint)]">
              ETA ~{eta}s
            </span>
          )}
        </div>
      </header>

      {/* Required apps */}
      {plan.requiredApps.length > 0 && (
        <div
          className="flex items-center"
          style={{ gap: "var(--space-2)", marginBottom: "var(--space-4)" }}
        >
          <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
            Apps requises
          </span>
          {plan.requiredApps.map((app) => (
            <span
              key={app}
              className="t-9 font-mono uppercase border border-[var(--border-shell)] rounded-pill"
              style={{
                padding: "var(--space-1) var(--space-2)",
                color: "var(--text-muted)",
              }}
            >
              {app}
            </span>
          ))}
        </div>
      )}

      {/* Steps timeline */}
      <ol
        className="relative flex flex-col"
        style={{ gap: "var(--space-3)" }}
        data-testid="step-list"
      >
        {plan.steps.map((step) => (
          <li key={step.id} className="relative">
            <StepCard
              step={step}
              onApprove={() => handleApprove(step.id)}
              onSkip={() => handleSkip(step.id)}
            />
          </li>
        ))}
      </ol>

      {plan.steps.length === 0 && (
        <p className="t-11 font-light text-[var(--text-faint)]">
          Aucun step planifié.
        </p>
      )}
    </section>
  );
}

"use client";

/**
 * StepCard — Card individuel pour un step de plan multi-step.
 *
 * Représente un nœud du MissionStepGraph. Status icon + label + footer
 * compact (provider + latency + cost). Collapsible : output partiel quand
 * expanded. Si status === "awaiting_approval", embarque l'ApprovalInline.
 *
 * Tokens design system uniquement (cf. CLAUDE.md).
 */

import { useState } from "react";
import { ApprovalInline } from "./ApprovalInline";
import { ProviderChip, type ProviderStatus } from "./ProviderChip";
import type { PlanStepState } from "@/stores/runtime";

export interface StepCardProps {
  step: PlanStepState;
  onApprove?: () => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
  onRetry?: () => void;
  onEdit?: () => void;
}

const STATUS_GLYPH: Record<PlanStepState["status"], string> = {
  idle: "·",
  running: "◐",
  awaiting_approval: "⏵",
  done: "✓",
  error: "✗",
  skipped: "⊘",
};

const STATUS_LABEL: Record<PlanStepState["status"], string> = {
  idle: "EN ATTENTE",
  running: "EN COURS",
  awaiting_approval: "VALIDATION",
  done: "TERMINÉ",
  error: "ÉCHEC",
  skipped: "SAUTÉ",
};

function statusColor(status: PlanStepState["status"]): string {
  switch (status) {
    case "running":
    case "awaiting_approval":
      return "var(--cykan)";
    case "done":
      return "var(--cykan)";
    case "error":
      return "var(--danger)";
    case "skipped":
      return "var(--text-faint)";
    case "idle":
    default:
      return "var(--text-ghost)";
  }
}

function providerStatusFor(status: PlanStepState["status"]): ProviderStatus {
  if (status === "running" || status === "awaiting_approval") return "pending";
  if (status === "error") return "error";
  return "success";
}

function formatCost(usd?: number): string {
  if (usd == null || !Number.isFinite(usd) || usd === 0) return "—";
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

function formatLatency(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function StepCard({ step, onApprove, onSkip, onRetry, onEdit }: StepCardProps) {
  const [expanded, setExpanded] = useState(step.status === "awaiting_approval");
  const color = statusColor(step.status);
  const showFooter = step.status === "done" || step.status === "running" || step.status === "error";
  const canExpand = !!step.output || step.status === "awaiting_approval" || step.status === "error";

  return (
    <div
      className="border border-[var(--border-shell)]"
      style={{
        background: "var(--surface-1)",
        padding: "var(--space-3) var(--space-4)",
      }}
      data-testid="step-card"
      data-step-id={step.id}
      data-status={step.status}
    >
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className="flex w-full items-center text-left"
        style={{ gap: "var(--space-3)" }}
        disabled={!canExpand}
        aria-expanded={expanded}
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center rounded-pill"
          style={{
            width: "var(--space-5)",
            height: "var(--space-5)",
            background: "var(--surface-2)",
            color,
          }}
        >
          {STATUS_GLYPH[step.status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="t-13 font-light text-[var(--text)] truncate">{step.label}</p>
          <p className="t-9 font-mono uppercase tracking-marquee" style={{ color }}>
            {STATUS_LABEL[step.status]}
          </p>
        </div>
        {showFooter && (
          <div
            className="flex items-center"
            style={{ gap: "var(--space-2)" }}
          >
            {step.providerId && (
              <ProviderChip
                providerId={step.providerId}
                status={providerStatusFor(step.status)}
                latencyMs={step.latencyMs}
                costUSD={step.costUSD}
              />
            )}
            <span className="t-9 font-mono text-[var(--text-faint)]">
              {formatLatency(step.latencyMs)}
            </span>
            <span className="t-9 font-mono text-[var(--text-faint)]">
              {formatCost(step.costUSD)}
            </span>
          </div>
        )}
      </button>

      {expanded && step.output && (
        <div
          className="t-11 font-light text-[var(--text-muted)] whitespace-pre-wrap"
          style={{
            marginTop: "var(--space-3)",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--border-shell)",
          }}
        >
          {step.output}
        </div>
      )}

      {expanded && step.error && (
        <div
          className="t-11 font-light text-[var(--danger)]"
          style={{
            marginTop: "var(--space-3)",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--border-shell)",
          }}
        >
          {step.error}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ghost-btn-solid ghost-btn-ghost t-9"
              style={{ marginLeft: "var(--space-3)" }}
              data-testid="step-retry"
            >
              <span className="tracking-wide uppercase">Réessayer</span>
            </button>
          )}
        </div>
      )}

      {step.status === "awaiting_approval" && step.approvalPreview && onApprove && onSkip && (
        <ApprovalInline
          stepId={step.id}
          preview={step.approvalPreview}
          kind={step.kind}
          providerId={step.providerId}
          onApprove={onApprove}
          onSkip={onSkip}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}

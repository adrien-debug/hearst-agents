"use client";

/**
 * ApprovalInline — Carte de validation inline pour un step write en attente.
 *
 * Affichée à l'intérieur d'un StepCard quand status === "awaiting_approval".
 * Vue inline, pas de modal lourd. Trois actions : Approuver, Modifier, Sauter.
 *
 * Tokens design system uniquement (cf. CLAUDE.md). Aucun magic px, aucune
 * couleur en dur.
 */

import { useState } from "react";
import { ProviderChip } from "./ProviderChip";
import { Action } from "./ui";

export interface ApprovalInlineProps {
  stepId: string;
  preview: string;
  kind: string;
  providerId?: string;
  onApprove: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onEdit?: () => void;
}

export function ApprovalInline({
  stepId,
  preview,
  kind,
  providerId,
  onApprove,
  onSkip,
  onEdit,
}: ApprovalInlineProps) {
  const [pending, setPending] = useState<"approve" | "skip" | null>(null);

  const handleApprove = async () => {
    setPending("approve");
    try {
      await onApprove();
    } finally {
      setPending(null);
    }
  };

  const handleSkip = async () => {
    setPending("skip");
    try {
      await onSkip();
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className="border-l-2 border-[var(--cykan)]"
      style={{
        background: "var(--cykan-surface)",
        padding: "var(--space-3) var(--space-4)",
        marginTop: "var(--space-3)",
      }}
      data-testid="approval-inline"
      data-step-id={stepId}
    >
      <div
        className="flex items-center"
        style={{ gap: "var(--space-2)", marginBottom: "var(--space-2)" }}
      >
        <span className="t-11 font-medium text-[var(--cykan)]">
          Validation requise
        </span>
        <span
          className="rounded-pill bg-[var(--text-ghost)]"
          style={{ width: "var(--space-1)", height: "var(--space-1)" }}
        />
        <span className="t-11 font-light text-[var(--text-faint)]">
          {kind}
        </span>
        {providerId && (
          <>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            />
            <ProviderChip providerId={providerId} status="pending" />
          </>
        )}
      </div>

      <p
        className="t-13 font-light text-[var(--text-soft)] whitespace-pre-wrap"
        style={{ marginBottom: "var(--space-3)" }}
      >
        {preview}
      </p>

      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <Action
          variant="primary"
          tone="brand"
          size="sm"
          onClick={handleApprove}
          disabled={pending !== null && pending !== "approve"}
          loading={pending === "approve"}
          testId="approval-approve"
        >
          Approuver
        </Action>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={pending !== null}
            className="ghost-btn-solid ghost-btn-ghost t-9"
            data-testid="approval-edit"
          >
            <span className="tracking-wide uppercase">Modifier</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleSkip}
          disabled={pending !== null}
          className="ghost-btn-solid ghost-btn-ghost t-9"
          data-testid="approval-skip"
        >
          <span className="tracking-wide uppercase">
            {pending === "skip" ? "…" : "Sauter"}
          </span>
        </button>
      </div>
    </div>
  );
}

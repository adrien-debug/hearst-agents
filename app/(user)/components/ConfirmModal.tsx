"use client";

/**
 * ConfirmModal — modal de confirmation pour les actions destructives.
 *
 * Comportement :
 *   - Backdrop centré + dialog focus-trap léger
 *   - ESC pour annuler
 *   - Bouton "Confirmer" coloré selon `variant` ("danger" | "primary")
 *   - Bouton "Annuler" toujours présent
 *
 * Tokens uniquement (CLAUDE.md §1) — couleurs / spacing / radius via
 * `var(--*)`.
 */

import { useEffect, useRef } from "react";
import { Action } from "./ui";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !loading) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    // Focus initial sur le bouton "Annuler" (option safe par défaut).
    const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>(
      "[data-testid='confirm-modal-cancel']",
    );
    cancelBtn?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      data-testid="confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        // Backdrop : color-mix sur le bg-center pour rester token-only.
        background: "color-mix(in srgb, var(--bg-center) 70%, transparent)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="flex flex-col"
        style={{
          minWidth: "var(--space-80, 320px)",
          maxWidth: "var(--space-96, 400px)",
          padding: "var(--space-6)",
          gap: "var(--space-4)",
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-card-hover)",
        }}
      >
        <h2
          id="confirm-modal-title"
          className="t-15 font-medium text-[var(--text)]"
          style={{ margin: 0, lineHeight: "var(--leading-snug)" }}
        >
          {title}
        </h2>
        {description && (
          <p
            className="t-13 font-light text-[var(--text-muted)]"
            style={{ margin: 0, lineHeight: 1.6 }}
          >
            {description}
          </p>
        )}
        <div className="flex items-center justify-end" style={{ gap: "var(--space-2)" }}>
          <Action
            variant="secondary"
            tone="neutral"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            testId="confirm-modal-cancel"
          >
            {cancelLabel}
          </Action>
          <Action
            variant="primary"
            tone={isDanger ? "danger" : "brand"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
            testId="confirm-modal-confirm"
          >
            {confirmLabel}
          </Action>
        </div>
      </div>
    </div>
  );
}

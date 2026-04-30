"use client";

/**
 * BuilderToolbar — actions du Builder.
 * - Templates : ouvre la liste des graphes prédéfinis
 * - Validate  : checke le graphe + affiche erreurs
 * - Preview   : lance un dry-run via /api/v2/workflows/preview
 * - Save      : POST /api/v2/missions avec workflowGraph
 * - Schedule  : input cron rapide (modifie le node trigger si présent)
 */

import type { ReactNode } from "react";

interface BuilderToolbarProps {
  onOpenTemplates: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSave: () => void;
  onPublish?: () => void;
  isBusy?: boolean;
  saveLabel?: string;
  validationCount?: number;
  previewSummary?: string | null;
}

export function BuilderToolbar({
  onOpenTemplates,
  onValidate,
  onPreview,
  onSave,
  onPublish,
  isBusy,
  saveLabel = "Sauvegarder",
  validationCount,
  previewSummary,
}: BuilderToolbarProps) {
  return (
    <div
      className="flex items-center justify-between border-b border-[var(--border-shell)]"
      style={{
        padding: "var(--space-3) var(--space-12)",
        gap: "var(--space-4)",
        background: "var(--bg-rail)",
      }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <ToolbarButton onClick={onOpenTemplates}>Templates</ToolbarButton>
        <ToolbarButton onClick={onValidate} accent="cykan">
          Valider
          {typeof validationCount === "number" && validationCount > 0 && (
            <span
              className="t-9 font-mono"
              style={{ color: "var(--danger)", marginLeft: "var(--space-1)" }}
            >
              ({validationCount})
            </span>
          )}
        </ToolbarButton>
        <ToolbarButton onClick={onPreview} accent="cykan" disabled={isBusy}>
          {isBusy ? "Preview…" : "Preview"}
        </ToolbarButton>
      </div>

      {previewSummary && (
        <span className="t-11 text-[var(--text-muted)] truncate max-w-md">
          {previewSummary}
        </span>
      )}

      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        {onPublish && (
          <ToolbarButton onClick={onPublish} accent="cykan" disabled={isBusy}>
            Publier marketplace
          </ToolbarButton>
        )}
        <ToolbarButton onClick={onSave} accent="money" disabled={isBusy}>
          {saveLabel}
        </ToolbarButton>
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  accent?: "cykan" | "money";
  disabled?: boolean;
  children: ReactNode;
}

function ToolbarButton({
  onClick,
  accent,
  disabled,
  children,
}: ToolbarButtonProps) {
  const color =
    accent === "cykan"
      ? "var(--cykan)"
      : accent === "money"
        ? "var(--money)"
        : "var(--text)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="t-10 font-mono uppercase tracking-section transition-colors disabled:opacity-40 rounded-md"
      style={{
        padding: "var(--space-2) var(--space-3)",
        color,
        border: `1px solid ${color}`,
        background: "transparent",
      }}
    >
      {children}
    </button>
  );
}

"use client";

/**
 * RowActions — groupe d'icon-buttons compacts visibles au hover de la ligne
 * parent.
 *
 * Utilisation : poser à droite d'une ligne (mission, asset, run…) avec
 * `showOnHover` (défaut true). La ligne parent doit porter la classe
 * `group` pour que les actions apparaissent (`group-hover:opacity-100`).
 *
 * Tokens uniquement (CLAUDE.md §1).
 */

import type { ReactNode, MouseEvent } from "react";

export interface RowAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

export interface RowActionsProps {
  actions: RowAction[];
  /** Affiche au hover du parent `.group` uniquement. Défaut true. */
  showOnHover?: boolean;
}

export function RowActions({ actions, showOnHover = true }: RowActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className={
        "flex items-center" +
        (showOnHover
          ? " opacity-0 group-hover:opacity-100 focus-within:opacity-100"
          : " opacity-100")
      }
      style={{
        gap: "var(--space-1)",
        transition: "opacity var(--duration-base) var(--ease-standard)",
      }}
      data-testid="row-actions"
    >
      {actions.map((a) => (
        <IconButton key={a.id} action={a} />
      ))}
    </div>
  );
}

function IconButton({ action }: { action: RowAction }) {
  const handleClick = (ev: MouseEvent<HTMLButtonElement>) => {
    // Empêche le clic sur l'icône de déclencher le onClick du parent (la
    // ligne entière est souvent cliquable pour ouvrir le détail).
    ev.stopPropagation();
    if (!action.disabled) action.onClick();
  };
  const isDanger = action.variant === "danger";
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={action.disabled}
      aria-label={action.label}
      title={action.label}
      data-testid={`row-action-${action.id}`}
      className="inline-flex items-center justify-center"
      style={{
        width: "var(--space-6)",
        height: "var(--space-6)",
        background: "transparent",
        color: isDanger ? "var(--danger)" : "var(--text-faint)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-xs)",
        cursor: action.disabled ? "not-allowed" : "pointer",
        opacity: action.disabled ? 0.5 : 1,
        transition: "color var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard), background var(--duration-base) var(--ease-standard)",
      }}
      onMouseEnter={(e) => {
        if (action.disabled) return;
        e.currentTarget.style.color = isDanger ? "var(--danger)" : "var(--cykan)";
        e.currentTarget.style.borderColor = isDanger ? "var(--danger)" : "var(--cykan-border-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = isDanger ? "var(--danger)" : "var(--text-faint)";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <span aria-hidden>{action.icon}</span>
    </button>
  );
}

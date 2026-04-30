"use client";

/**
 * StageActionBar — barre d'actions cohérente pour tous les Stages.
 *
 * Architecture :
 *   - `primary` (max 1) : bouton cykan filled, action mise en avant
 *   - `secondary` (n) : boutons border, actions courantes
 *   - `overflow` (n) : menu kebab `⋯` qui ouvre un dropdown avec les
 *     actions "moins fréquentes"
 *   - `onBack` : bouton "← Retour ⌘⌫" à gauche (icône + label + raccourci)
 *
 * Tokens uniquement (CLAUDE.md §1) — couleurs / spacing / radius via
 * `var(--*)`. Aucun magic number.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface StageAction {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "default" | "danger";
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface StageActionBarProps {
  /** Slot label gauche (ex: "ASSET · 4f3a · REPORT"). Optionnel. */
  context?: ReactNode;
  /** Action mise en avant (cykan filled). Une seule. */
  primary?: StageAction;
  /** Actions secondaires (boutons border, icon + label). */
  secondary?: StageAction[];
  /** Actions overflow (kebab `⋯` → menu dropdown). */
  overflow?: StageAction[];
  /** Si fourni, affiche le bouton "Retour ⌘⌫" à gauche. */
  onBack?: () => void;
  /** Label du bouton retour. Défaut "Retour". */
  backLabel?: string;
}

export function StageActionBar({
  context,
  primary,
  secondary = [],
  overflow = [],
  onBack,
  backLabel = "Retour",
}: StageActionBarProps) {
  return (
    <header
      className="flex items-center justify-between flex-shrink-0 relative z-10 border-b border-[var(--border-default)]"
      style={{
        paddingLeft: "var(--space-12)",
        paddingRight: "var(--space-12)",
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
      }}
      data-testid="stage-action-bar"
    >
      <div className="flex items-center" style={{ gap: "var(--space-4)" }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="halo-on-hover inline-flex items-center t-11 font-light border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] shrink-0"
            style={{
              gap: "var(--space-2)",
              paddingLeft: "var(--space-3)",
              paddingRight: "var(--space-3)",
              paddingTop: "var(--space-1)",
              paddingBottom: "var(--space-1)",
              transition: "color var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard)",
            }}
            title={backLabel}
            data-testid="stage-action-back"
            aria-label={backLabel}
          >
            <span aria-hidden>←</span>
            <span>{backLabel}</span>
            <span style={{ opacity: 0.6 }}>{"⌘⌫"}</span>
          </button>
        )}
        {context && <div className="flex items-center" style={{ gap: "var(--space-4)" }}>{context}</div>}
      </div>

      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        {secondary.map((a) => (
          <SecondaryButton key={a.id} action={a} />
        ))}
        {primary && <PrimaryButton action={primary} />}
        {overflow.length > 0 && <OverflowMenu actions={overflow} />}
      </div>
    </header>
  );
}

// ── Buttons ──────────────────────────────────────────────────────

function PrimaryButton({ action }: { action: StageAction }) {
  const isDanger = action.variant === "danger";
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      data-testid={`stage-action-${action.id}`}
      aria-label={action.label}
      className="inline-flex items-center t-11 font-light shrink-0"
      style={{
        gap: "var(--space-2)",
        paddingLeft: "var(--space-3)",
        paddingRight: "var(--space-3)",
        paddingTop: "var(--space-1)",
        paddingBottom: "var(--space-1)",
        background: isDanger ? "var(--danger)" : "var(--cykan)",
        color: "var(--bg-center)",
        border: "1px solid " + (isDanger ? "var(--danger)" : "var(--cykan)"),
        borderRadius: "var(--radius-xs)",
        cursor: action.disabled || action.loading ? "not-allowed" : "pointer",
        opacity: action.disabled || action.loading ? 0.5 : 1,
        transition: "opacity var(--duration-base) var(--ease-standard)",
      }}
    >
      {action.icon && <span aria-hidden>{action.icon}</span>}
      <span>{action.loading ? "…" : action.label}</span>
      {action.shortcut && !action.loading && (
        <span style={{ opacity: 0.6 }}>{action.shortcut}</span>
      )}
    </button>
  );
}

function SecondaryButton({ action }: { action: StageAction }) {
  const isDanger = action.variant === "danger";
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      data-testid={`stage-action-${action.id}`}
      aria-label={action.label}
      className="halo-on-hover inline-flex items-center t-11 font-light shrink-0"
      style={{
        gap: "var(--space-2)",
        paddingLeft: "var(--space-3)",
        paddingRight: "var(--space-3)",
        paddingTop: "var(--space-1)",
        paddingBottom: "var(--space-1)",
        background: "transparent",
        color: isDanger ? "var(--danger)" : "var(--text-faint)",
        border: "1px solid " + (isDanger ? "var(--danger)" : "var(--border-shell)"),
        borderRadius: "var(--radius-xs)",
        cursor: action.disabled || action.loading ? "not-allowed" : "pointer",
        opacity: action.disabled || action.loading ? 0.5 : 1,
        transition: "color var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard)",
      }}
    >
      {action.icon && <span aria-hidden>{action.icon}</span>}
      <span>{action.loading ? "…" : action.label}</span>
      {action.shortcut && !action.loading && (
        <span style={{ opacity: 0.6 }}>{action.shortcut}</span>
      )}
    </button>
  );
}

function OverflowMenu({ actions }: { actions: StageAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Plus d'actions"
        data-testid="stage-action-overflow-toggle"
        className="halo-on-hover inline-flex items-center justify-center t-11 font-light shrink-0"
        style={{
          width: "var(--space-8)",
          height: "var(--space-8)",
          background: "transparent",
          color: open ? "var(--cykan)" : "var(--text-faint)",
          border: "1px solid " + (open ? "var(--cykan-border-hover)" : "var(--border-shell)"),
          borderRadius: "var(--radius-xs)",
          cursor: "pointer",
          transition: "color var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard)",
        }}
      >
        <span aria-hidden>{"⋯"}</span>
      </button>
      {open && (
        <div
          role="menu"
          data-testid="stage-action-overflow-menu"
          className="absolute right-0 z-20"
          style={{
            top: "calc(100% + var(--space-2))",
            background: "var(--card-flat-bg, var(--surface-1))",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-1)",
            minWidth: "var(--space-32)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              disabled={a.disabled}
              data-testid={`stage-action-${a.id}`}
              className="inline-flex items-center w-full t-11 font-light text-left hover:text-[var(--cykan)]"
              style={{
                gap: "var(--space-2)",
                paddingLeft: "var(--space-3)",
                paddingRight: "var(--space-3)",
                paddingTop: "var(--space-2)",
                paddingBottom: "var(--space-2)",
                background: "transparent",
                color: a.variant === "danger" ? "var(--danger)" : "var(--text-muted)",
                border: 0,
                borderRadius: "var(--radius-xs)",
                cursor: a.disabled ? "not-allowed" : "pointer",
                opacity: a.disabled ? 0.5 : 1,
                transition: "color var(--duration-base) var(--ease-standard)",
              }}
            >
              {a.icon && <span aria-hidden>{a.icon}</span>}
              <span style={{ flex: 1 }}>{a.label}</span>
              {a.shortcut && <span style={{ opacity: 0.6 }}>{a.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

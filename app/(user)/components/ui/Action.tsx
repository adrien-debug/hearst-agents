"use client";

/**
 * <Action> — primitive bouton/lien unifiée du DS Hearst OS.
 *
 * Remplace les 60+ usages ad-hoc de `bg-[var(--cykan)]`, `border-cykan`,
 * `t-9 font-mono uppercase tracking-marquee`, etc. dispersés dans l'app.
 *
 * Axes :
 *   variant : "primary" | "secondary" | "ghost" | "link"
 *   tone    : "brand" (cykan) | "gold" | "neutral" | "danger"
 *   size    : "sm" (t-11, h ≈ space-7) | "md" (t-13, h ≈ space-10)
 *
 * États inclus : idle / hover / active / focus-visible / disabled / loading.
 * Focus-visible : ring 1px var(--cykan-border) — uniforme sur tout le DS.
 *
 * Si `href` est fourni → rendu en <Link> (Next.js). Sinon <button>.
 * `loading` désactive le clic + remplace les enfants par un "…".
 *
 * Tokens uniquement (CLAUDE.md §1). Pas de mono caps, pas de halo gimmick.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ActionVariant = "primary" | "secondary" | "ghost" | "link";
export type ActionTone = "brand" | "gold" | "neutral" | "danger";
export type ActionSize = "sm" | "md";

interface ActionBaseProps {
  variant?: ActionVariant;
  tone?: ActionTone;
  size?: ActionSize;
  loading?: boolean;
  disabled?: boolean;
  /** Icon avant le label (optionnel). */
  iconLeft?: ReactNode;
  /** Icon après le label (optionnel). */
  iconRight?: ReactNode;
  /** Hotkey indicator rendu en suffixe discret (ex : ⌘K). */
  hotkey?: string;
  children?: ReactNode;
  className?: string;
  /** Aria-label obligatoire si pas de children visible (icon-only). */
  "aria-label"?: string;
  testId?: string;
}

interface ActionAsButton extends ActionBaseProps {
  href?: undefined;
  type?: "button" | "submit" | "reset";
  onClick?: ComponentProps<"button">["onClick"];
}

interface ActionAsLink extends ActionBaseProps {
  href: string;
  type?: undefined;
  onClick?: ComponentProps<"a">["onClick"];
  /** Lien externe : ouvre dans nouvel onglet + rel noopener. */
  external?: boolean;
}

type ActionProps = ActionAsButton | ActionAsLink;

// ── Style maps ────────────────────────────────────────────────

const SIZE_CLASSES: Record<ActionSize, string> = {
  sm: "t-11 h-7 px-3",
  md: "t-13 h-10 px-4",
};

const PRIMARY_TONE: Record<ActionTone, string> = {
  brand:
    "bg-[var(--cykan)] text-[var(--text-on-cykan)] hover:opacity-90 active:opacity-80",
  gold:
    "bg-[var(--gold)] text-[var(--bg)] hover:opacity-90 active:opacity-80",
  neutral:
    "bg-[var(--text)] text-[var(--bg)] hover:opacity-90 active:opacity-80",
  danger:
    "bg-[var(--danger)] text-[var(--bg)] hover:opacity-90 active:opacity-80",
};

const SECONDARY_TONE: Record<ActionTone, string> = {
  brand:
    "border border-[var(--cykan-border)] text-[var(--cykan)] bg-[var(--cykan-surface)] hover:border-[var(--cykan-border-hover)] hover:bg-[var(--cykan-bg-hover)]",
  gold:
    "border border-[var(--gold-border)] text-[var(--gold)] bg-[var(--gold-surface)] hover:bg-[var(--gold-bg-hover)]",
  neutral:
    "border border-[var(--border-shell)] text-[var(--text-soft)] hover:border-[var(--border-default)] hover:text-[var(--text)]",
  danger:
    "border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)]/5",
};

const GHOST_TONE: Record<ActionTone, string> = {
  brand: "text-[var(--text-faint)] hover:text-[var(--cykan)]",
  gold: "text-[var(--text-faint)] hover:text-[var(--gold)]",
  neutral: "text-[var(--text-faint)] hover:text-[var(--text)]",
  danger: "text-[var(--text-faint)] hover:text-[var(--danger)]",
};

const LINK_TONE: Record<ActionTone, string> = {
  brand:
    "text-[var(--cykan)] border-b border-[var(--cykan)] hover:opacity-80 px-0",
  gold:
    "text-[var(--gold)] border-b border-[var(--gold-border)] hover:opacity-80 px-0",
  neutral:
    "text-[var(--text-soft)] border-b border-[var(--border-default)] hover:text-[var(--text)] px-0",
  danger:
    "text-[var(--danger)] border-b border-[var(--danger)] hover:opacity-80 px-0",
};

const FONT_WEIGHT: Record<ActionVariant, string> = {
  primary: "font-medium",
  secondary: "font-medium",
  ghost: "font-light",
  link: "font-light",
};

// ── Composant ─────────────────────────────────────────────────

export function Action(props: ActionProps) {
  const {
    variant = "secondary",
    tone = "brand",
    size = "md",
    loading = false,
    disabled = false,
    iconLeft,
    iconRight,
    hotkey,
    children,
    className = "",
    testId,
  } = props;

  const isDisabled = disabled || loading;

  const toneMap =
    variant === "primary"
      ? PRIMARY_TONE
      : variant === "secondary"
        ? SECONDARY_TONE
        : variant === "ghost"
          ? GHOST_TONE
          : LINK_TONE;

  // Pas de "h-N" sur les links → on garde leur baseline naturelle.
  const sizeClass = variant === "link" ? "t-13" : SIZE_CLASSES[size];

  const composed = [
    "inline-flex items-center justify-center gap-2 rounded-sm",
    "transition-colors duration-base",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan-border-hover)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    sizeClass,
    FONT_WEIGHT[variant],
    toneMap[tone],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {iconLeft && <span className="shrink-0 inline-flex">{iconLeft}</span>}
      <span className="truncate">
        {loading ? "…" : children}
      </span>
      {iconRight && <span className="shrink-0 inline-flex">{iconRight}</span>}
      {hotkey && (
        <span className="shrink-0 t-9 font-mono tabular-nums opacity-60 ml-1">
          {hotkey}
        </span>
      )}
    </>
  );

  if ("href" in props && props.href) {
    const { href, onClick, external } = props;
    if (isDisabled) {
      return (
        <span
          className={composed}
          aria-disabled="true"
          data-testid={testId}
          aria-label={props["aria-label"]}
        >
          {content}
        </span>
      );
    }
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={composed}
          onClick={onClick}
          data-testid={testId}
          aria-label={props["aria-label"]}
        >
          {content}
        </a>
      );
    }
    return (
      <Link
        href={href}
        className={composed}
        onClick={onClick}
        data-testid={testId}
        aria-label={props["aria-label"]}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={(props as ActionAsButton).type ?? "button"}
      onClick={(props as ActionAsButton).onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"]}
      data-testid={testId}
      className={composed}
    >
      {content}
    </button>
  );
}

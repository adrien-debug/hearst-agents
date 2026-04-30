"use client";

/**
 * CommandeurResultRow — Ligne unifiée pour la palette Commandeur.
 *
 * Toutes les sections (Actions, Recent, Assets, Missions, Threads, Tools)
 * passent par ce composant pour garantir la cohérence visuelle. Le glyph
 * et le hint changent par kind, mais la grille reste constante.
 */

import type { ReactNode } from "react";

export type CommandeurResultKind =
  | "action"
  | "asset"
  | "thread"
  | "mission"
  | "run"
  | "tool"
  | "kg";

interface CommandeurResultRowProps {
  kind: CommandeurResultKind;
  label: string;
  hint?: string;
  hotkey?: string;
  glyph?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onHover?: () => void;
}

const KIND_GLYPH: Record<CommandeurResultKind, string> = {
  action: "›",
  asset: "◆",
  thread: "◇",
  mission: "▣",
  run: "↻",
  tool: "▲",
  kg: "◯",
};

export function CommandeurResultRow({
  kind,
  label,
  hint,
  hotkey,
  glyph,
  active = false,
  disabled = false,
  onSelect,
  onHover,
}: CommandeurResultRowProps) {
  const renderedGlyph = glyph ?? KIND_GLYPH[kind];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full py-3 flex items-baseline gap-6 text-left transition-all duration-200 ${
        disabled
          ? "opacity-20 cursor-not-allowed"
          : active
            ? "translate-x-2"
            : "hover:translate-x-1"
      }`}
    >
      <span
        className={`t-13 font-mono shrink-0 transition-colors duration-200 ${
          active && !disabled
            ? "text-[var(--cykan)]"
            : "text-[var(--text-ghost)]"
        }`}
      >
        {renderedGlyph}
      </span>
      <span
        className={`t-24 leading-none tracking-tight transition-colors duration-200 ${
          active && !disabled ? "text-[var(--text)]" : "text-[var(--text-muted)]"
        }`}
      >
        {label}
      </span>
      {hint && (
        <span
          className={`t-9 font-mono uppercase tracking-snug transition-colors duration-200 ${
            active && !disabled ? "text-[var(--text-muted)]" : "text-[var(--text-ghost)]"
          }`}
        >
          {hint}
        </span>
      )}
      {hotkey && (
        <span
          className="t-11 font-light ml-auto shrink-0"
          style={{ color: "var(--text-ghost)" }}
        >
          {hotkey}
        </span>
      )}
    </button>
  );
}

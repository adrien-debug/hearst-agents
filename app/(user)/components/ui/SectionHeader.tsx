"use client";

/**
 * <SectionHeader> — primitive header de section.
 *
 * Pattern dupliqué 32× dans des `<header className="flex items-baseline justify-between mb-4">`
 * avec label + count + action. Ici extrait en un composant unique.
 *
 * Voix éditoriale (pivot 2026-05-01) :
 *   - label : t-13 font-medium text-l1
 *   - count : t-11 font-mono tabular-nums text-faint
 *   - action : <Action variant="link" size="md" tone="brand">
 *
 * Variants `density` :
 *   - "compact" (default) : marge basse var(--space-4)
 *   - "section" : marge basse var(--space-6) — pour sections principales d'un Stage
 */

import type { ReactNode } from "react";

interface SectionHeaderProps {
  label: ReactNode;
  count?: number;
  action?: ReactNode;
  density?: "compact" | "section";
  className?: string;
}

export function SectionHeader({
  label,
  count,
  action,
  density = "compact",
  className = "",
}: SectionHeaderProps) {
  const marginBottom =
    density === "section" ? "var(--space-6)" : "var(--space-4)";

  return (
    <header
      className={`flex items-baseline justify-between gap-3 ${className}`}
      style={{ marginBottom }}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="t-13 font-medium text-[var(--text-l1)] truncate">
          {label}
        </span>
        {typeof count === "number" && (
          <span className="t-11 font-mono tabular-nums text-[var(--text-faint)] shrink-0">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

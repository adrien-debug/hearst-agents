"use client";

/**
 * <EmptyState> — primitive empty state unifiée.
 *
 * Pattern dupliqué 9× dans /runs, /missions, /personas, /reports,
 * /marketplace, /archive, /assets, /notifications, /planner avec typo,
 * padding et CTA divergents. Ici extrait en un composant unique.
 *
 * Voix éditoriale (pivot 2026-05-01) :
 *   - icon : optionnel, t-34 text-cykan opacity-30 (◉, ◐, ◍, ◈, ◇...)
 *   - title : t-15 font-light text-soft
 *   - description : t-13 font-light text-muted leading-relaxed
 *   - cta : <Action variant="link" tone="brand">
 *
 * Variants `density` :
 *   - "compact" : py-12 (filtres, sections internes)
 *   - "section" (default) : py-16 (page complète)
 */

import type { ReactNode } from "react";
import { Action } from "./Action";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  density?: "compact" | "section";
  className?: string;
  testId?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  density = "section",
  className = "",
  testId,
}: EmptyStateProps) {
  const paddingY = density === "compact" ? "var(--space-12)" : "var(--space-16)";

  return (
    <div
      data-testid={testId}
      className={`flex flex-col items-center text-center ${className}`}
      style={{
        gap: "var(--space-4)",
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      {icon && (
        <span className="block t-34 text-[var(--cykan)] opacity-30" aria-hidden>
          {icon}
        </span>
      )}
      <p className="t-15 font-light text-[var(--text-soft)]">{title}</p>
      {description && (
        <p
          className="t-13 font-light text-[var(--text-muted)] leading-relaxed"
          style={{ maxWidth: "var(--space-96, 32rem)" }}
        >
          {description}
        </p>
      )}
      {cta && (
        <div style={{ marginTop: "var(--space-2)" }}>
          {cta.href ? (
            <Action variant="link" tone="brand" href={cta.href}>
              {cta.label}
            </Action>
          ) : (
            <Action variant="link" tone="brand" onClick={cta.onClick}>
              {cta.label}
            </Action>
          )}
        </div>
      )}
    </div>
  );
}

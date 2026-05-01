"use client";

/**
 * <RowSkeleton> et <CardSkeleton> — skeletons unifiés pour les pages
 * en chargement.
 *
 * Remplace le pattern "Chargement…" en texte plat (8 pages user) et le
 * mélange ghost-skeleton-bar inline (3 sites missions). Voix éditoriale
 * cohérente : barres de chargement animées, pas de spinner ni texte mono.
 *
 * Usage :
 *   <RowSkeleton count={5} />          // tables (runs, missions, archive)
 *   <CardSkeleton count={6} columns={3} />  // grilles (personas, marketplace, planner)
 *
 * Tokens uniquement (CLAUDE.md §1) — utilise --space-N, --radius-X, et la
 * classe `.ghost-skeleton-bar` qui définit l'animation pulse en CSS.
 */

interface RowSkeletonProps {
  count?: number;
  height?: string;
  className?: string;
  testId?: string;
}

export function RowSkeleton({
  count = 5,
  height = "var(--space-12)",
  className = "",
  testId,
}: RowSkeletonProps) {
  return (
    <div
      className={`flex flex-col ${className}`}
      style={{ gap: "var(--space-2)" }}
      aria-busy="true"
      aria-live="polite"
      data-testid={testId ?? "row-skeleton"}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ghost-skeleton-bar"
          style={{ height, borderRadius: "var(--radius-xs)" }}
        />
      ))}
    </div>
  );
}

interface CardSkeletonProps {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  height?: string;
  className?: string;
  testId?: string;
}

export function CardSkeleton({
  count = 6,
  columns = 3,
  height = "var(--space-32)",
  className = "",
  testId,
}: CardSkeletonProps) {
  return (
    <div
      className={`grid ${className}`}
      style={{
        gap: "var(--space-4)",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
      aria-busy="true"
      aria-live="polite"
      data-testid={testId ?? "card-skeleton"}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ghost-skeleton-bar"
          style={{ height, borderRadius: "var(--radius-md)" }}
        />
      ))}
    </div>
  );
}

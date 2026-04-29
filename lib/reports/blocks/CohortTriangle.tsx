"use client";

/**
 * CohortTriangle — rétention par cohorte (C1, C2, C3, …).
 *
 * Modèle de données :
 *   cohorts: [
 *     { label: "2026-01", values: [1.00, 0.62, 0.48, 0.41] },
 *     { label: "2026-02", values: [1.00, 0.58, 0.45] },
 *     { label: "2026-03", values: [1.00, 0.65] },
 *     { label: "2026-04", values: [1.00] },
 *   ]
 *
 * Visuel Ghost Protocol :
 *   - grille triangulaire (chaque cohorte n'affiche que les périodes vécues)
 *   - heatmap intensity sur var(--cykan) avec opacité = valeur
 *   - texte t-9 mono tabular-nums au centre de chaque cellule
 *   - axe horizontal : périodes 0..N (M0, M1, M2, …)
 *   - axe vertical : labels cohortes
 *
 * Pas de magic number. Couleur unique = cykan, l'intensité encode la rétention.
 */

import { fmtPercent } from "./format";

export interface CohortRow {
  label: string;
  values: ReadonlyArray<number>;
}

export interface CohortTriangleProps {
  cohorts: ReadonlyArray<CohortRow>;
  /** Préfixe affiché sur l'axe horizontal pour chaque période. Défaut "M". */
  periodPrefix?: string;
  /** Si true, affiche les valeurs en %. Sinon en nombre brut. Défaut true. */
  asPercent?: boolean;
}

export function CohortTriangle({
  cohorts,
  periodPrefix = "M",
  asPercent = true,
}: CohortTriangleProps) {
  if (!cohorts || cohorts.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Cohortes vides"
      >
        Aucune donnée
      </div>
    );
  }

  // Période la plus longue → nombre de colonnes.
  const periodCount = cohorts.reduce(
    (m, c) => Math.max(m, c.values.length),
    0,
  );
  if (periodCount === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Cohortes vides"
      >
        Aucune donnée
      </div>
    );
  }

  // Domaine pour normaliser l'opacité : on assume des valeurs ∈ [0, 1] si asPercent,
  // sinon on calcule min/max sur l'ensemble des valeurs présentes.
  let vMin = 0;
  let vMax = 1;
  if (!asPercent) {
    const flat = cohorts.flatMap((c) => c.values).filter((v) => Number.isFinite(v));
    if (flat.length > 0) {
      vMin = Math.min(...flat);
      vMax = Math.max(...flat);
    }
  }
  const vSpan = vMax - vMin || 1;

  return (
    <div
      role="table"
      aria-label="Triangle de rétention par cohorte"
      className="w-full overflow-auto"
    >
      <table
        className="w-full"
        style={{ borderCollapse: "separate", borderSpacing: 0 }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="t-9 font-mono uppercase text-[var(--text-muted)] text-left"
              style={{
                padding: "var(--space-2) var(--space-3)",
                letterSpacing: "0.15em",
                borderBottom: "1px solid var(--surface-2)",
              }}
            >
              cohorte
            </th>
            {Array.from({ length: periodCount }, (_, i) => (
              <th
                key={`period-${i}`}
                scope="col"
                className="t-9 font-mono uppercase text-[var(--text-muted)]"
                style={{
                  padding: "var(--space-2) var(--space-2)",
                  letterSpacing: "0.15em",
                  borderBottom: "1px solid var(--surface-2)",
                  textAlign: "center",
                }}
              >
                {periodPrefix}
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort, ri) => (
            <tr key={`${cohort.label}-${ri}`}>
              <th
                scope="row"
                className="t-9 font-mono uppercase text-[var(--text-soft)] text-left"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  letterSpacing: "0.15em",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                {cohort.label}
              </th>
              {Array.from({ length: periodCount }, (_, ci) => {
                const v = cohort.values[ci];
                if (v === undefined || v === null || !Number.isFinite(v)) {
                  return (
                    <td
                      key={`empty-${cohort.label}-${ci}`}
                      style={{
                        padding: "var(--space-2)",
                        borderBottom: "1px solid var(--line)",
                      }}
                      aria-hidden
                    />
                  );
                }
                const intensity = Math.max(0, Math.min(1, (v - vMin) / vSpan));
                const display = asPercent ? fmtPercent(v) : v.toString();
                return (
                  <td
                    key={`cell-${cohort.label}-${ci}`}
                    role="cell"
                    aria-label={`${cohort.label} ${periodPrefix}${ci}: ${display}`}
                    className="t-9 font-mono tabular-nums"
                    style={{
                      padding: "var(--space-2)",
                      textAlign: "center",
                      color: intensity > 0.55 ? "var(--text-on-cykan)" : "var(--text-soft)",
                      background: `color-mix(in srgb, var(--cykan) ${(intensity * 100).toFixed(0)}%, transparent)`,
                      borderBottom: "1px solid var(--line)",
                    }}
                    title={display}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

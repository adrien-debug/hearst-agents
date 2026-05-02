"use client";

/**
 * Heatmap — calendar/matrix de volume (jour x heure, source x métrique, etc.).
 *
 * Modèle de données :
 *   xLabels: ["00h", "01h", … "23h"]
 *   yLabels: ["Lun", "Mar", … "Dim"]
 *   values:  [[0,0,0,…], [0,0,1,…], …]  // values[yIndex][xIndex]
 *
 * Visuel Ghost Protocol :
 *   - grille rectangulaire compacte
 *   - intensité encodée par opacité sur var(--cykan)
 *   - axes labelisés en mono uppercase t-9
 *   - aucune cellule sélectionnable (lecture seule en V1)
 *
 * Pas de magic number. Couleur unique = cykan, l'opacité encode le volume.
 */

import { fmtNumber } from "./format";

interface HeatmapProps {
  xLabels: ReadonlyArray<string>;
  yLabels: ReadonlyArray<string>;
  /** Matrice values[y][x]. Cellules manquantes/non-finies traitées comme 0. */
  values: ReadonlyArray<ReadonlyArray<number>>;
  /** Hauteur d'une cellule en pixels. Défaut : --space-6 (24px). */
  cellHeight?: number;
  /** Si true, affiche la valeur dans la cellule (sinon hover-only via title). */
  showValues?: boolean;
}

export function Heatmap({
  xLabels,
  yLabels,
  values,
  cellHeight,
  showValues = false,
}: HeatmapProps) {
  if (!xLabels || xLabels.length === 0 || !yLabels || yLabels.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Heatmap vide"
      >
        Aucune donnée
      </div>
    );
  }

  // Calcule min/max ignorant les NaN.
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let y = 0; y < yLabels.length; y++) {
    const row = values[y] ?? [];
    for (let x = 0; x < xLabels.length; x++) {
      const v = row[x];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
  }
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) {
    vMin = 0;
    vMax = 1;
  }
  const vSpan = vMax - vMin || 1;

  return (
    <div
      role="img"
      aria-label={`Heatmap ${yLabels.length} × ${xLabels.length}`}
      className="flex flex-col w-full"
      style={{ gap: "var(--space-2)" }}
    >
      <div
        role="table"
        aria-label="Grille heatmap"
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
                aria-hidden
                style={{
                  padding: "var(--space-1) var(--space-2)",
                  borderBottom: "1px solid var(--surface-2)",
                }}
              />
              {xLabels.map((xl, xi) => (
                <th
                  key={`x-${xl}-${xi}`}
                  scope="col"
                  className="t-9 font-mono uppercase text-[var(--text-muted)]"
                  style={{
                    padding: "var(--space-1)",
                    letterSpacing: "0.15em",
                    textAlign: "center",
                    borderBottom: "1px solid var(--surface-2)",
                  }}
                >
                  {xl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yLabels.map((yl, yi) => {
              const row = values[yi] ?? [];
              return (
                <tr key={`y-${yl}-${yi}`}>
                  <th
                    scope="row"
                    className="t-9 font-mono uppercase text-[var(--text-soft)] text-left"
                    style={{
                      padding: "var(--space-1) var(--space-2)",
                      letterSpacing: "0.15em",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    {yl}
                  </th>
                  {xLabels.map((_, xi) => {
                    const raw = row[xi];
                    const v =
                      typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
                    const intensity = Math.max(
                      0,
                      Math.min(1, (v - vMin) / vSpan),
                    );
                    const display = fmtNumber(v);
                    return (
                      <td
                        key={`cell-${yi}-${xi}`}
                        role="cell"
                        aria-label={`${yl} ${xLabels[xi]}: ${display}`}
                        className="t-9 font-mono tabular-nums"
                        style={{
                          padding: "var(--space-1)",
                          height: cellHeight ? `${cellHeight}px` : "var(--space-6)",
                          textAlign: "center",
                          color:
                            intensity > 0.55
                              ? "var(--text-on-cykan)"
                              : "var(--text-soft)",
                          background: `color-mix(in srgb, var(--cykan) ${(intensity * 100).toFixed(0)}%, transparent)`,
                          borderBottom: "1px solid var(--line)",
                          minWidth: "var(--space-6)",
                        }}
                        title={display}
                      >
                        {showValues ? display : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

/**
 * Sankey — flow entre étapes (traffic source → landing → conversion).
 *
 * Modèle de données :
 *   nodes: [{ id: "source_a", label: "Source A" }, …]
 *   links: [{ source: "source_a", target: "landing_b", value: 1240 }, …]
 *
 * Visuel Ghost Protocol :
 *   - layout layered (chaque node placé en colonne selon sa profondeur dans le DAG)
 *   - rectangles nodes en var(--text), labels mono uppercase t-9
 *   - chemins courbes (cubic Bézier) pour les links — couleur var(--cykan)
 *     avec opacité dégradée selon la valeur relative
 *   - largeur de chemin proportionnelle à la valeur du link
 *
 * Pas de magic number. Couleur unique = cykan, l'intensité encode le flux.
 */

import { fmtNumber } from "./format";

export interface SankeyNode {
  id: string;
  label: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyProps {
  nodes: ReadonlyArray<SankeyNode>;
  links: ReadonlyArray<SankeyLink>;
  /** Hauteur du graphique en pixels. Défaut 280. */
  height?: number;
}

export function Sankey({ nodes, links, height = 280 }: SankeyProps) {
  if (!nodes || nodes.length === 0 || !links || links.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
        role="img"
        aria-label="Sankey vide"
      >
        Aucune donnée
      </div>
    );
  }

  // ── Layout layered : assigne une colonne à chaque node selon sa profondeur. ──
  const nodeIds = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const l of links) {
    if (!nodeIds.has(l.source) || !nodeIds.has(l.target)) continue;
    outgoing.get(l.source)?.push(l.target);
    incoming.get(l.target)?.push(l.source);
  }

  // BFS depuis les sources (no incoming) pour assigner depth.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incoming.get(n.id) ?? []).length === 0) {
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  }
  // Fallback : si aucun root, premier node = depth 0.
  if (queue.length === 0 && nodes.length > 0) {
    depth.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const d = depth.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      const prev = depth.get(next);
      if (prev === undefined || prev < d + 1) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  // Tout node restant sans depth → 0.
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, 0);
  }

  const maxDepth = Math.max(...Array.from(depth.values()), 0);
  const columns: SankeyNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of nodes) {
    columns[depth.get(n.id) ?? 0].push(n);
  }

  // ── Coordonnées : viewBox 1000 × 600. ──
  const VB_W = 1000;
  const VB_H = 600;
  const NODE_W = 14;
  const NODE_H_FACTOR = 36; // hauteur node = sum(value links) * facteur normalisé

  // Calcule le poids total entrant ou sortant de chaque node.
  const nodeWeight = new Map<string, number>();
  for (const n of nodes) nodeWeight.set(n.id, 0);
  for (const l of links) {
    if (!Number.isFinite(l.value) || l.value < 0) continue;
    nodeWeight.set(l.source, (nodeWeight.get(l.source) ?? 0) + l.value);
    nodeWeight.set(l.target, (nodeWeight.get(l.target) ?? 0) + l.value);
  }
  const maxColumnSum = columns.reduce((m, col) => {
    const sum = col.reduce((s, n) => s + (nodeWeight.get(n.id) ?? 0), 0);
    return Math.max(m, sum);
  }, 0) || 1;

  // Position de chaque node : y empilé par colonne, h proportionnel au poids.
  type NodeBox = { id: string; label: string; x: number; y: number; w: number; h: number };
  const nodeBoxes = new Map<string, NodeBox>();
  const colSpan = maxDepth > 0 ? (VB_W - NODE_W) / maxDepth : 0;

  columns.forEach((col, colIdx) => {
    const totalH = col.reduce(
      (s, n) => s + ((nodeWeight.get(n.id) ?? 0) / maxColumnSum) * VB_H * NODE_H_FACTOR / 100,
      0,
    );
    const padding = Math.max(0, (VB_H - totalH) / Math.max(1, col.length + 1));
    let cursorY = padding;
    for (const n of col) {
      const w = nodeWeight.get(n.id) ?? 0;
      const h = Math.max(8, (w / maxColumnSum) * VB_H * NODE_H_FACTOR / 100);
      const x = colIdx * colSpan;
      nodeBoxes.set(n.id, { id: n.id, label: n.label, x, y: cursorY, w: NODE_W, h });
      cursorY += h + padding;
    }
  });

  // Largeur des links : proportionnelle à value relative au max link.
  const maxLinkValue = links.reduce((m, l) => Math.max(m, Number.isFinite(l.value) ? l.value : 0), 0) || 1;

  // Track le cursor d'attache (y) sur chaque node pour empiler les links.
  const sourceCursor = new Map<string, number>();
  const targetCursor = new Map<string, number>();
  for (const n of nodes) {
    const box = nodeBoxes.get(n.id);
    if (box) {
      sourceCursor.set(n.id, box.y);
      targetCursor.set(n.id, box.y);
    }
  }

  return (
    <div
      role="img"
      aria-label={`Sankey ${nodes.length} nodes ${links.length} links`}
      className="flex flex-col w-full"
      style={{ gap: "var(--space-3)" }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        <title>Sankey — {links.length} flux</title>

        {/* Links (cubic Bézier) — rendus avant les nodes pour empiler dessous. */}
        {links.map((l, i) => {
          const sBox = nodeBoxes.get(l.source);
          const tBox = nodeBoxes.get(l.target);
          if (!sBox || !tBox) return null;
          const value = Number.isFinite(l.value) ? Math.max(0, l.value) : 0;
          const linkH = Math.max(0.5, (value / maxLinkValue) * Math.min(sBox.h, tBox.h));
          const sY = sourceCursor.get(l.source) ?? sBox.y;
          const tY = targetCursor.get(l.target) ?? tBox.y;
          sourceCursor.set(l.source, sY + linkH);
          targetCursor.set(l.target, tY + linkH);

          const x1 = sBox.x + sBox.w;
          const x2 = tBox.x;
          const cx1 = x1 + (x2 - x1) / 2;
          const cx2 = x2 - (x2 - x1) / 2;
          const yMidS = sY + linkH / 2;
          const yMidT = tY + linkH / 2;

          const intensity = Math.max(0.15, Math.min(0.85, value / maxLinkValue));
          const path = `M ${x1} ${yMidS} C ${cx1} ${yMidS}, ${cx2} ${yMidT}, ${x2} ${yMidT}`;

          return (
            <path
              key={`link-${l.source}-${l.target}-${i}`}
              d={path}
              fill="none"
              stroke="var(--cykan)"
              strokeOpacity={intensity}
              strokeWidth={linkH}
              strokeLinecap="butt"
            >
              <title>{`${l.source} → ${l.target} : ${fmtNumber(value)}`}</title>
            </path>
          );
        })}

        {/* Nodes (rectangles) au-dessus des links. */}
        {Array.from(nodeBoxes.values()).map((box) => (
          <g key={`node-${box.id}`}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              fill="var(--text)"
              fillOpacity={0.85}
            >
              <title>{box.label}</title>
            </rect>
          </g>
        ))}
      </svg>

      {/* Légende des nodes : labels groupés par colonne. */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
          gap: "var(--space-2)",
        }}
      >
        {columns.map((col, ci) => (
          <div
            key={`col-${ci}`}
            className="flex flex-col"
            style={{ gap: "var(--space-1)" }}
          >
            {col.map((n) => (
              <span
                key={`label-${n.id}`}
                className="t-9 font-mono uppercase text-[var(--text-muted)] truncate"
                style={{ letterSpacing: "0.15em" }}
                title={n.label}
              >
                {n.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

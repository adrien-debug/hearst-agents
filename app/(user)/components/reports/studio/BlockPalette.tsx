"use client";

/**
 * BlockPalette — palette des primitives disponibles pour le block editor.
 *
 * Liste les types de blocks supportés par le runtime (PRIMITIVE_KINDS V1) avec
 * un label métier et une description courte. Drag-source pour le SpecOutline,
 * et click-to-add comme fallback (aucune dépendance lib drag).
 *
 * Tokens uniquement, conforme CLAUDE.md.
 */

import type { PrimitiveKind } from "@/lib/reports/spec/schema";

export interface BlockPaletteProps {
  /** Click ou drop sur le SpecOutline. */
  onAdd: (kind: PrimitiveKind) => void;
}

interface PaletteEntry {
  kind: PrimitiveKind;
  label: string;
  description: string;
  icon: string;
}

const PALETTE: ReadonlyArray<PaletteEntry> = [
  { kind: "kpi",             label: "KPI",          description: "Valeur scalaire + delta + sparkline", icon: "#" },
  { kind: "sparkline",       label: "Sparkline",    description: "Mini-courbe d'évolution",             icon: "~" },
  { kind: "bar",             label: "Bar Chart",    description: "Histogramme catégoriel",              icon: "▌" },
  { kind: "table",           label: "Table",        description: "Tableau de lignes",                   icon: "≡" },
  { kind: "funnel",          label: "Funnel",       description: "Étapes de conversion",                icon: "▽" },
  { kind: "waterfall",       label: "Waterfall",    description: "Décomposition incrémentale",          icon: "↑↓" },
  { kind: "cohort_triangle", label: "Cohortes",     description: "Triangle de rétention",               icon: "△" },
  { kind: "heatmap",         label: "Heatmap",      description: "Matrice X/Y colorée",                 icon: "▦" },
  { kind: "sankey",          label: "Sankey",       description: "Flux entre catégories",               icon: "≋" },
  { kind: "bullet",          label: "Bullet",       description: "Atteinte d'un objectif",              icon: "●" },
  { kind: "radar",           label: "Radar",        description: "Profil multi-axes",                   icon: "◈" },
  { kind: "gantt",           label: "Gantt",        description: "Timeline de tâches",                  icon: "◫" },
];

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <aside
      data-testid="studio-palette"
      className="flex flex-col h-full overflow-y-auto"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <header className="flex flex-col" style={{ gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
        <h2
          className="t-9 font-mono uppercase"
          style={{
            color: "var(--text-muted)",
                      }}
        >
          Blocks
        </h2>
        <p className="t-9" style={{ color: "var(--text-faint)" }}>
          Glisse ou clique pour ajouter
        </p>
      </header>

      <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
        {PALETTE.map((entry) => (
          <li key={entry.kind}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-hearst-block", entry.kind);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onAdd(entry.kind)}
              data-testid={`palette-${entry.kind}`}
              className="w-full flex items-center text-left transition-colors"
              style={{
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                background: "transparent",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius-xs)",
                cursor: "grab",
                transitionDuration: "var(--duration-base)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.borderColor = "var(--cykan-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--surface-2)";
              }}
            >
              <span
                className="t-13 font-mono"
                style={{
                  color: "var(--cykan)",
                  width: "var(--space-5)",
                  textAlign: "center",
                }}
              >
                {entry.icon}
              </span>
              <span className="flex flex-col flex-1" style={{ gap: "var(--space-0)" }}>
                <span className="t-11" style={{ color: "var(--text-soft)" }}>
                  {entry.label}
                </span>
                <span className="t-9" style={{ color: "var(--text-faint)" }}>
                  {entry.description}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

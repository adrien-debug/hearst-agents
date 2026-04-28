"use client";

import type { CanvasNode } from "./topology";

interface Props {
  node: CanvasNode | null;
  onClear: () => void;
}

/**
 * Fiche technique d’un stage — toujours visible dans la colonne droite
 * (placeholder si aucun nœud sélectionné).
 */
export default function NodeDetailPanel({ node, onClear }: Props) {
  if (!node) {
    return (
      <div className="flex flex-col gap-(--space-4) px-(--space-4) py-(--space-5) min-h-0 flex-1 justify-center">
        <div className="flex flex-col gap-(--space-1)">
          <p className="t-10 font-mono uppercase tracking-[var(--tracking-label)] text-(--text-faint)">
            Stage du pipeline
          </p>
          <p className="t-13 font-medium text-text leading-snug">
            Sélectionne un nœud sur le graphe
          </p>
        </div>
        <p className="t-12 leading-relaxed text-text-muted">
          Clique un stage (ex. Agent custom, Research, Pipeline…) pour afficher ici la description,
          les entrées / sorties, le fichier source et les événements SSE associés.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <header className="shrink-0 flex items-start justify-between gap-(--space-3) px-(--space-4) py-(--space-4) border-b border-line bg-surface">
        <div className="flex flex-col gap-(--space-1) min-w-0">
          <span className="t-15 font-semibold text-text leading-tight">{node.label}</span>
          <span className="t-10 font-mono uppercase tracking-[var(--tracking-label)] text-(--text-faint)">
            {node.sublabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="t-10 font-mono uppercase tracking-[var(--tracking-caption)] text-text-faint hover:text-text transition-colors duration-(--duration-base) ease-(--ease-standard) shrink-0"
        >
          effacer
        </button>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-(--space-4) px-(--space-4) py-(--space-4)">
        <div className="rounded-(--radius-md) bg-bg-soft px-(--space-3) py-(--space-3) border border-line">
          <p className="t-10 font-mono uppercase tracking-[var(--tracking-caption)] text-(--text-faint) mb-(--space-2)">
            Rôle
          </p>
          <p className="t-12 leading-relaxed text-text">{node.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-(--space-3)">
          <div className="flex flex-col gap-(--space-2)">
            <span className="t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)">
              Inputs
            </span>
            <span className="t-12 text-text leading-snug">{node.inputs}</span>
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <span className="t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)">
              Outputs
            </span>
            <span className="t-12 text-text leading-snug">{node.outputs}</span>
          </div>
        </div>

        <div className="flex flex-col gap-(--space-2)">
          <span className="t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)">
            Source
          </span>
          <div className="rounded-(--radius-sm) bg-bg-soft px-(--space-3) py-(--space-2) border border-line">
            <p className="t-11 font-mono tracking-[var(--tracking-hairline)] text-(--cykan) break-all leading-snug">
              {node.fileHint}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-(--space-2)">
          <span className="t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)">
            Events SSE
          </span>
          <ul className="flex flex-col gap-(--space-2)">
            {node.events.map((e) => (
              <li
                key={e}
                className="t-11 font-mono tracking-[var(--tracking-hairline)] text-text-soft pl-(--space-3) border-l-2 border-(--cykan)/25"
              >
                {e}
              </li>
            ))}
          </ul>
        </div>

        {node.branches && node.branches.length > 0 && (
          <div className="flex flex-col gap-(--space-2)">
            <span className="t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)">
              Branchements
            </span>
            <ul className="flex flex-col gap-(--space-2)">
              {node.branches.map((b) => (
                <li key={b} className="t-12 text-text-soft leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-(--space-3) mt-auto border-t border-line">
          <span
            className={
              node.toggleable
                ? "t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--cykan)"
                : "t-9 font-mono uppercase tracking-[var(--tracking-stretch)] text-(--text-faint)"
            }
          >
            {node.toggleable && node.flagKey
              ? `Toggle — flag « ${node.flagKey} »`
              : "Stage non toggleable"}
          </span>
        </div>
      </div>
    </div>
  );
}

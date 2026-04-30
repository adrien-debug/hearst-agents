"use client";

/**
 * SpecOutline — liste verticale des blocks du spec en cours.
 *
 * Permet :
 *   - de réordonner les blocks via boutons ↑/↓ (drag-handle natif si supporté)
 *   - de focusser un block (click → onSelect)
 *   - de supprimer un block (×)
 *   - de recevoir un drop depuis la BlockPalette (drop zone visible)
 *
 * État hidden affiché en gris transparent.
 *
 * Tokens uniquement, conforme CLAUDE.md.
 */

import { useState } from "react";
import type { BlockSpec, PrimitiveKind } from "@/lib/reports/spec/schema";

export interface SpecOutlineProps {
  blocks: ReadonlyArray<BlockSpec>;
  /** Block actuellement focusé (highlight). */
  selectedBlockId?: string;
  onSelect: (blockId: string) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onRemove: (blockId: string) => void;
  /** Drop depuis la palette : ajoute un nouveau block du kind donné. */
  onDropKind: (kind: PrimitiveKind) => void;
}

export function SpecOutline({
  blocks,
  selectedBlockId,
  onSelect,
  onMove,
  onRemove,
  onDropKind,
}: SpecOutlineProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-hearst-block")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDropTarget(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData("application/x-hearst-block");
    setIsDropTarget(false);
    if (!kind) return;
    onDropKind(kind as PrimitiveKind);
  };

  return (
    <section
      data-testid="studio-outline"
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleDrop}
      className="flex flex-col h-full overflow-y-auto"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: isDropTarget ? "var(--cykan-surface)" : "transparent",
        border: `1px solid ${isDropTarget ? "var(--cykan-border)" : "transparent"}`,
        borderRadius: "var(--radius-xs)",
        transition: `background var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard)`,
      }}
    >
      <header className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
        <h2
          className="t-9 font-mono uppercase"
          style={{
            color: "var(--text-muted)",
            letterSpacing: "var(--tracking-display)",
          }}
        >
          Structure
        </h2>
        <span className="t-9 font-mono" style={{ color: "var(--text-faint)" }}>
          {blocks.length} block{blocks.length > 1 ? "s" : ""}
        </span>
      </header>

      {blocks.length === 0 && (
        <div
          data-testid="outline-empty"
          className="flex flex-col items-center justify-center text-center"
          style={{
            padding: "var(--space-6)",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-xs)",
            gap: "var(--space-1)",
          }}
        >
          <span className="t-11" style={{ color: "var(--text-muted)" }}>
            Aucun block
          </span>
          <span className="t-9" style={{ color: "var(--text-faint)" }}>
            Glisse depuis la palette →
          </span>
        </div>
      )}

      <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
        {blocks.map((block, index) => {
          const isSelected = block.id === selectedBlockId;
          return (
            <li
              key={block.id}
              data-testid={`outline-block-${block.id}`}
              className="flex items-center"
              style={{
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                background: isSelected ? "var(--cykan-surface)" : "var(--surface-1)",
                border: `1px solid ${isSelected ? "var(--cykan-border)" : "var(--surface-2)"}`,
                borderRadius: "var(--radius-xs)",
                opacity: block.hidden ? 0.5 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(block.id)}
                data-testid={`outline-select-${block.id}`}
                className="flex flex-1 items-center text-left"
                style={{
                  gap: "var(--space-2)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <span
                  className="t-9 font-mono uppercase"
                  style={{
                    color: "var(--cykan)",
                    letterSpacing: "var(--tracking-display)",
                    minWidth: "var(--space-16)",
                  }}
                >
                  {block.type}
                </span>
                <span
                  className="t-11 truncate"
                  style={{ color: isSelected ? "var(--text)" : "var(--text-soft)", flex: 1 }}
                  title={block.label ?? block.id}
                >
                  {block.label ?? block.id}
                </span>
              </button>

              <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
                <button
                  type="button"
                  onClick={() => onMove(block.id, -1)}
                  disabled={index === 0}
                  aria-label="Remonter"
                  data-testid={`outline-up-${block.id}`}
                  className="t-9 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    width: "var(--space-5)",
                    height: "var(--space-5)",
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "1px solid var(--surface-2)",
                    borderRadius: "var(--radius-xs)",
                    transitionDuration: "var(--duration-base)",
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(block.id, 1)}
                  disabled={index === blocks.length - 1}
                  aria-label="Descendre"
                  data-testid={`outline-down-${block.id}`}
                  className="t-9 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    width: "var(--space-5)",
                    height: "var(--space-5)",
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "1px solid var(--surface-2)",
                    borderRadius: "var(--radius-xs)",
                    transitionDuration: "var(--duration-base)",
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(block.id)}
                  aria-label="Supprimer"
                  data-testid={`outline-remove-${block.id}`}
                  className="t-9 transition-colors"
                  style={{
                    width: "var(--space-5)",
                    height: "var(--space-5)",
                    color: "var(--color-error)",
                    background: "transparent",
                    border: "1px solid var(--surface-2)",
                    borderRadius: "var(--radius-xs)",
                    transitionDuration: "var(--duration-base)",
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

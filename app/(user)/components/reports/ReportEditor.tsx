"use client";

/**
 * ReportEditor — éditeur visuel du ReportSpec actif (panneau latéral).
 *
 * Diffère de `ReportSpecEditor` (mode démo full-page, preview live + Apply
 * one-shot) : ici on opère sur le spec courant rendu par ReportLayout, on
 * émet `onChange` à chaque modif (toggle hidden, reorder, reset) pour que
 * le parent puisse mettre à jour son state et re-rendre les blocks.
 *
 * Features V1 :
 *   1. Toggle visibilité (`block.hidden`) par block — checkbox cykan
 *   2. Réordonner blocks via boutons ↑/↓ (premier ne monte pas, dernier
 *      ne descend pas — désactivés)
 *   3. Preview JSON readonly du spec courant (collapsible, mono pre)
 *   4. Reset → restaure la copie initiale mémorisée au mount
 *
 * UI : panneau scrollable (parent gère width / position). Pas de modal,
 * pas de drag-drop natif. Tokens uniquement, conforme CLAUDE.md.
 *
 * Test surface (data-testid) :
 *   - `report-editor`               (root)
 *   - `report-editor-reset`         (bouton Reset)
 *   - `report-editor-close`         (bouton fermeture, optionnel via onClose)
 *   - `report-editor-toggle-{id}`   (checkbox hidden)
 *   - `report-editor-up-{id}`       (bouton remonter)
 *   - `report-editor-down-{id}`     (bouton descendre)
 *   - `report-editor-json`          (pre readonly)
 *   - `report-editor-json-toggle`   (bouton expand/collapse JSON)
 */

import { useCallback, useEffect, useState } from "react";
import type { ReportSpec, BlockSpec } from "@/lib/reports/spec/schema";

export interface ReportEditorProps {
  /** Spec courant édité — source de vérité, contrôlé par le parent. */
  spec: ReportSpec;
  /** Callback émis à chaque modification (toggle hidden, reorder, reset). */
  onChange: (spec: ReportSpec) => void;
  /** Callback optionnel pour fermer le panneau (bouton ✕ dans le header). */
  onClose?: () => void;
}

export function ReportEditor({ spec, onChange, onClose }: ReportEditorProps) {
  // Mémorise une copie initiale du spec au mount pour permettre Reset.
  // On utilise un useState lazy initializer pour ne capturer le spec qu'une fois.
  const [initialSpec] = useState<ReportSpec>(() => structuredClone(spec));
  const [jsonOpen, setJsonOpen] = useState(false);

  // ESC ferme le panneau si onClose fourni.
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggleHidden = useCallback(
    (blockId: string) => {
      const next = spec.blocks.map((b) =>
        b.id === blockId ? { ...b, hidden: !b.hidden } : b,
      );
      onChange({ ...spec, blocks: next });
    },
    [spec, onChange],
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= spec.blocks.length) return;
      const next = [...spec.blocks];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      onChange({ ...spec, blocks: next });
    },
    [spec, onChange],
  );

  const reset = useCallback(() => {
    onChange(structuredClone(initialSpec));
  }, [initialSpec, onChange]);

  const visibleCount = spec.blocks.filter((b) => !b.hidden).length;
  const totalCount = spec.blocks.length;

  return (
    <aside
      role="complementary"
      aria-label="Éditeur de rapport"
      data-testid="report-editor"
      className="flex flex-col h-full w-full"
      style={{
        background: "var(--card-flat-bg)",
        borderLeft: "1px solid var(--card-flat-border)",
        gap: "var(--space-4)",
        padding: "var(--space-5)",
      }}
    >
      {/* Header : titre + compteur + close */}
      <header
        className="flex items-center justify-between"
        style={{
          paddingBottom: "var(--space-3)",
          borderBottom: "1px solid var(--surface-2)",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          <span
            className="t-9 font-mono uppercase text-[var(--text-muted)]"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            Éditeur
          </span>
          <span className="t-13 text-[var(--text)] tabular-nums">
            {visibleCount} / {totalCount} blocs visibles
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'éditeur"
            data-testid="report-editor-close"
            className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--text-soft)]"
            style={{
              letterSpacing: "var(--tracking-display)",
              padding: "var(--space-1) var(--space-3)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius-xs)",
              background: "transparent",
              transition: "color var(--duration-fast) var(--ease-standard)",
            }}
          >
            Fermer
          </button>
        )}
      </header>

      {/* Toolbar : Reset + JSON toggle */}
      <div
        className="flex items-center"
        style={{ gap: "var(--space-2)" }}
      >
        <button
          type="button"
          onClick={reset}
          data-testid="report-editor-reset"
          className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--text-soft)]"
          style={{
            letterSpacing: "var(--tracking-display)",
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-xs)",
            background: "transparent",
            transition: "color var(--duration-fast) var(--ease-standard)",
          }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => setJsonOpen((v) => !v)}
          data-testid="report-editor-json-toggle"
          aria-expanded={jsonOpen}
          className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--text-soft)]"
          style={{
            letterSpacing: "var(--tracking-display)",
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-xs)",
            background: "transparent",
            transition: "color var(--duration-fast) var(--ease-standard)",
          }}
        >
          {jsonOpen ? "Masquer JSON" : "Voir JSON"}
        </button>
      </div>

      {/* Liste des blocks — toggle + up/down */}
      <ul
        className="flex flex-col flex-1 overflow-y-auto"
        style={{ gap: "var(--space-2)" }}
        data-testid="report-editor-block-list"
      >
        {spec.blocks.map((block, index) => (
          <BlockEditorRow
            key={block.id}
            block={block}
            index={index}
            total={spec.blocks.length}
            onToggle={() => toggleHidden(block.id)}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
          />
        ))}
      </ul>

      {/* Preview JSON */}
      {jsonOpen && (
        <pre
          data-testid="report-editor-json"
          className="t-9 font-mono text-[var(--text-soft)] overflow-auto"
          style={{
            padding: "var(--space-3)",
            background: "var(--surface-1)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-xs)",
            lineHeight: "var(--leading-base)",
            maxHeight: "var(--height-admin-prompt-max)",
            margin: 0,
          }}
        >
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </aside>
  );
}

// ── Row d'un block ──────────────────────────────────────────────

interface BlockEditorRowProps {
  block: BlockSpec;
  index: number;
  total: number;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlockEditorRow({
  block,
  index,
  total,
  onToggle,
  onMoveUp,
  onMoveDown,
}: BlockEditorRowProps) {
  const isVisible = !block.hidden;
  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;
  const titleText = block.label ?? block.id;

  return (
    <li
      className="flex items-center"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: isVisible ? "var(--surface-1)" : "transparent",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius-xs)",
      }}
    >
      <input
        type="checkbox"
        checked={isVisible}
        onChange={onToggle}
        aria-label={`Toggle visibilité ${block.id}`}
        data-testid={`report-editor-toggle-${block.id}`}
        style={{ accentColor: "var(--cykan)" }}
      />
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: "var(--space-1)" }}>
        <span
          className={`t-11 truncate ${
            isVisible ? "text-[var(--text-soft)]" : "text-[var(--text-faint)]"
          }`}
          title={titleText}
        >
          {titleText}
        </span>
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <span
            className="t-9 font-mono uppercase text-[var(--cykan)]"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            {block.type}
          </span>
          <span
            className="t-9 font-mono uppercase text-[var(--text-faint)]"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            #{block.id}
          </span>
          <span
            className="t-9 font-mono uppercase text-[var(--text-faint)]"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            col_{block.layout.col}
          </span>
        </div>
      </div>
      <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Remonter ${block.id}`}
          data-testid={`report-editor-up-${block.id}`}
          className="t-9 font-mono text-[var(--text-muted)] hover:text-[var(--cykan)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            padding: "var(--space-1) var(--space-2)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-xs)",
            background: "transparent",
            transition: "color var(--duration-fast) var(--ease-standard)",
          }}
        >
          {"↑"}
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Descendre ${block.id}`}
          data-testid={`report-editor-down-${block.id}`}
          className="t-9 font-mono text-[var(--text-muted)] hover:text-[var(--cykan)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            padding: "var(--space-1) var(--space-2)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-xs)",
            background: "transparent",
            transition: "color var(--duration-fast) var(--ease-standard)",
          }}
        >
          {"↓"}
        </button>
      </div>
    </li>
  );
}

"use client";

/**
 * CodeEditor — Éditeur de code MVP pour ArtifactStage (B8).
 *
 * Textarea mono avec gouttière de numéros de lignes synchronisée. Pas de
 * dépendance à Monaco/CodeMirror — Adrien a tranché : pas d'install d'un
 * gros package juste pour le MVP. Si on a besoin de syntax highlighting
 * plus tard, on intégrera Shiki ou highlight.js (server-render OK).
 *
 * Design system :
 *   - couleurs : --text, --text-muted, --bg-rail, --border-default
 *   - typo    : font-mono, t-13
 *   - spacing : --space-N uniquement (CLAUDE.md §1)
 *
 * Hotkey ⌘Enter géré ici → propagé via onRun (le parent gère l'enqueue).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRun?: () => void;
  language?: "python" | "node";
  disabled?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  language: _language = "python",
  disabled = false,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const lineNumbers = useMemo(() => {
    const lines = value.split("\n");
    return lines.map((_, i) => i + 1);
  }, [value]);

  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    const gutter = gutterRef.current;
    if (!ta || !gutter) return;
    gutter.scrollTop = ta.scrollTop;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // ⌘Enter / Ctrl+Enter → run
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRun?.();
        return;
      }
      // Tab → 2 espaces (UX MVP, pas d'auto-indent intelligent)
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = value.slice(0, start) + "  " + value.slice(end);
        onChange(next);
        // Restore caret après React update — defer 1 tick
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 2;
            textareaRef.current.selectionEnd = start + 2;
          }
        });
      }
    },
    [onChange, onRun, value],
  );

  useEffect(() => {
    handleScroll();
  }, [value, handleScroll]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--bg-rail)]"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r border-[var(--border-default)] text-right t-11"
        style={{
          paddingTop: "var(--space-3)",
          paddingBottom: "var(--space-3)",
          paddingLeft: "var(--space-3)",
          paddingRight: "var(--space-3)",
          color: "var(--text-faint)",
          minWidth: "var(--space-12)",
          lineHeight: "1.5",
          background: "var(--surface-1)",
        }}
      >
        {lineNumbers.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="flex-1 resize-none bg-transparent t-13 leading-relaxed outline-none"
        style={{
          padding: "var(--space-3)",
          color: "var(--text)",
          caretColor: "var(--cykan)",
          lineHeight: "1.5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
        placeholder="# Code Python ou Node — ⌘Enter pour exécuter"
      />
    </div>
  );
}

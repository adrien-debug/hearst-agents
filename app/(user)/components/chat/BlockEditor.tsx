"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

/**
 * BlockEditor — mode édition d'un block.
 *
 * UI continue avec le block lecture (pas de cadre épais). Auto-resize via
 * scrollHeight, ESC = annule, Cmd/Ctrl+Enter = enregistre. Toolbar minimale
 * en bas en mono uppercase.
 */

interface BlockEditorProps {
  initialValue: string;
  onSave: (newContent: string) => void;
  onCancel: () => void;
}

export function BlockEditor({
  initialValue,
  onSave,
  onCancel,
}: BlockEditorProps) {
  const [value, setValue] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Resize au mount + à chaque changement.
  useEffect(() => {
    autoResize();
    taRef.current?.focus();
    // Place le caret à la fin pour l'expérience d'édition.
    const len = taRef.current?.value.length ?? 0;
    taRef.current?.setSelectionRange(len, len);
  }, [autoResize]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    autoResize();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSave(value);
    }
  };

  return (
    <div data-testid="block-editor" className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Éditer le block"
        className="t-15 leading-relaxed font-light text-[var(--text-soft)] bg-transparent w-full resize-none outline-none whitespace-pre-wrap border-l border-[var(--cykan)]"
        style={{
          paddingLeft: "var(--space-4)",
          minHeight: "var(--space-12)",
        }}
      />
      <div
        className="flex items-center"
        style={{ gap: "var(--space-3)", paddingLeft: "var(--space-4)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler l'édition"
          data-testid="block-editor-cancel"
          className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--text)] transition-colors bg-transparent"
          style={{ transitionDuration: "var(--duration-base)" }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onSave(value)}
          aria-label="Enregistrer le block"
          data-testid="block-editor-save"
          className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] hover:text-[var(--cykan)] transition-colors bg-transparent"
          style={{ transitionDuration: "var(--duration-base)" }}
        >
          Enregistrer
        </button>
        <span
          className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]"
          aria-hidden
        >
          ESC · ⌘+↵
        </span>
      </div>
    </div>
  );
}

"use client";

/**
 * InputModeSelector — pill-tabs minimalistes au-dessus du textarea.
 *
 * 3 modes : Demander / Analyser / Créer. Le mode actif est lu et écrit
 * dans `useChatContext`. Aucune prop : full store-driven.
 *
 * Le mode actif n'a pas encore d'effet runtime — Lot C l'injectera dans
 * le system-prompt. Pour l'instant, c'est uniquement un signal UI.
 */

import { useChatContext, type InputMode } from "@/stores/chat-context";

const MODES: { value: InputMode; label: string }[] = [
  { value: "ask", label: "Demander" },
  { value: "analyze", label: "Analyser" },
  { value: "create", label: "Créer" },
];

export function InputModeSelector() {
  const inputMode = useChatContext((s) => s.inputMode);
  const setInputMode = useChatContext((s) => s.setInputMode);

  return (
    <div
      data-testid="input-mode-selector"
      role="tablist"
      aria-label="Mode de saisie"
      className="flex flex-row gap-1 mb-3"
    >
      {MODES.map((mode) => {
        const active = mode.value === inputMode;
        return (
          <button
            key={mode.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            data-testid={`input-mode-${mode.value}`}
            onClick={() => setInputMode(mode.value)}
            className={`rounded-pill t-9 font-mono uppercase tracking-marquee transition-colors duration-base ${
              active
                ? "border border-[var(--cykan)] bg-[var(--surface-1)] text-[var(--cykan)]"
                : "border border-transparent bg-transparent text-[var(--text-faint)] hover:text-[var(--text-muted)]"
            }`}
            style={{ padding: "var(--space-1) var(--space-3)" }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

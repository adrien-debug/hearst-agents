"use client";

/**
 * ContextChips — affiche les chips de contexte actives au-dessus de
 * l'input du Thinking Canvas. Lit directement le store `useChatContext`.
 *
 * - 0 chip → ne rend rien (no flash).
 * - Click sur le label → émet `chat-context:focus` (custom event) avec
 *   `{ id, kind }` ; les autres lots peuvent l'écouter pour focaliser
 *   l'élément lié (asset, mission, rapport…).
 * - Click sur la croix → retire le chip via `removeChip`.
 */

import { useChatContext } from "@/stores/chat-context";

export function ContextChips() {
  const chips = useChatContext((s) => s.chips);
  const removeChip = useChatContext((s) => s.removeChip);

  if (chips.length === 0) return null;

  return (
    <div
      data-testid="context-chips"
      className="flex flex-row flex-wrap gap-2 mb-3"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={`context-chip-${chip.id}`}
          className="group inline-flex items-center gap-2 rounded-pill border border-[var(--border-shell)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-colors duration-base"
          style={{ padding: "var(--space-2) var(--space-3)" }}
        >
          <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              window.dispatchEvent(
                new CustomEvent("chat-context:focus", {
                  detail: { id: chip.id, kind: chip.kind },
                }),
              );
            }}
            className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--text-soft)] transition-colors"
            data-testid={`context-chip-label-${chip.id}`}
          >
            {chip.label}
          </button>
          <button
            type="button"
            onClick={() => removeChip(chip.id)}
            aria-label={`Retirer ${chip.label}`}
            className="text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors flex items-center justify-center"
            data-testid={`context-chip-remove-${chip.id}`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 2 L8 8 M8 2 L2 8" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}

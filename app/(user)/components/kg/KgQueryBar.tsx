"use client";

/**
 * KgQueryBar — barre de recherche fuzzy sur les labels du Knowledge Graph.
 * Submit on Enter (ou bouton Loupe). État loading + bouton clear.
 *
 * UX : la recherche déclenche un highlight côté KnowledgeStage. Ce composant
 * ne gère que l'input + appel parent.
 */

import { useState, type FormEvent } from "react";

interface KgQueryBarProps {
  defaultValue?: string;
  onSearch: (query: string) => void;
  onClear: () => void;
  loading?: boolean;
}

export function KgQueryBar({
  defaultValue = "",
  onSearch,
  onClear,
  loading = false,
}: KgQueryBarProps) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      onClear();
      return;
    }
    onSearch(trimmed);
  };

  const handleClear = () => {
    setValue("");
    onClear();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 border border-[var(--border-default)] bg-[var(--surface-card)] rounded-md"
      style={{ padding: "var(--space-2) var(--space-4)" }}
    >
      <span
        aria-hidden
        className="t-13 text-[var(--text-faint)]"
      >
        ⌕
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Rechercher une entité (ex: Adrien, ACME, …)"
        className="flex-1 bg-transparent outline-none t-13 font-light text-[var(--text-soft)] placeholder:text-[var(--text-ghost)]"
        aria-label="Rechercher dans le Knowledge Graph"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          aria-label="Effacer la recherche"
        >
          ESC
        </button>
      )}
      <button
        type="submit"
        disabled={loading}
        className="t-11 font-medium text-[var(--cykan)] disabled:opacity-50"
        style={{ transitionProperty: "letter-spacing", transitionDuration: "var(--duration-slow)", transitionTimingFunction: "var(--ease-out)" }}
      >
        {loading ? "…" : "GO"}
      </button>
    </form>
  );
}

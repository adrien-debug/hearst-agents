"use client";

/**
 * PersonaSwitcher — dropdown compact dans la zone d'actions du ChatInput.
 *
 * Affiche la persona active et permet d'en sélectionner une autre pour le
 * thread courant (override per-thread). La sélection est conservée en
 * `localStorage` sous la clé `hearst:persona:<threadId|global>`.
 *
 * Tokens design system uniquement (cf. CLAUDE.md règles UI).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Persona } from "@/lib/personas/types";

interface PersonaSwitcherProps {
  threadId?: string | null;
  /** Appelé quand le user choisit une persona — passe l'id (ou null = aucune). */
  onChange?: (personaId: string | null) => void;
  className?: string;
}

const STORAGE_PREFIX = "hearst:persona:";

function storageKey(threadId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${threadId ?? "global"}`;
}

export function PersonaSwitcher({
  threadId = null,
  onChange,
  className,
}: PersonaSwitcherProps) {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(storageKey(null));
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/personas", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status_${r.status}`))))
      .then((data: { personas: Persona[] }) => {
        if (cancelled) return;
        setPersonas(data.personas ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setPersonas([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh activeId quand threadId change (lecture localStorage scopée).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(storageKey(threadId));
        setActiveId(stored);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const select = useCallback(
    (id: string | null) => {
      setActiveId(id);
      try {
        if (id) window.localStorage.setItem(storageKey(threadId), id);
        else window.localStorage.removeItem(storageKey(threadId));
      } catch {
        /* ignore */
      }
      setOpen(false);
      onChange?.(id);
    },
    [threadId, onChange],
  );

  const active = personas?.find((p) => p.id === activeId) ?? null;
  const label = active ? active.name : "Auto";
  const tone = active?.tone ?? null;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          active
            ? `Persona active : ${active.name}${tone ? ` (${tone})` : ""}`
            : "Persona auto (selon surface)"
        }
        aria-label="Choisir une persona"
        data-testid="persona-switcher-trigger"
        className="flex items-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors duration-base"
        style={{
          gap: "var(--space-2)",
          padding: "var(--space-1) var(--space-3)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-pill)",
          background: active ? "var(--cykan-surface)" : "transparent",
          borderColor: active ? "var(--cykan-border)" : "var(--line-strong)",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="t-9 font-mono uppercase tracking-marquee">{label}</span>
      </button>

      {open && personas && (
        <div
          className="absolute right-0 z-50 overflow-hidden"
          style={{
            bottom: "calc(100% + var(--space-2))",
            minWidth: "var(--space-56)",
            background: "var(--mat-300)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-card-hover)",
          }}
          role="listbox"
          data-testid="persona-switcher-menu"
        >
          <button
            type="button"
            onClick={() => select(null)}
            role="option"
            aria-selected={activeId === null}
            className="w-full text-left transition-colors hover:bg-[var(--surface-1)]"
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--line-strong)",
            }}
          >
            <div className="t-11 font-medium text-[var(--text-soft)]">Auto</div>
            <div className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
              persona selon surface
            </div>
          </button>
          {personas.length === 0 ? (
            <div
              className="t-10 tracking-marquee uppercase font-mono text-[var(--text-ghost)]"
              style={{ padding: "var(--space-3) var(--space-4)" }}
            >
              Aucune persona — crée la première sur /personas
            </div>
          ) : (
            personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p.id)}
                role="option"
                aria-selected={p.id === activeId}
                className="w-full text-left transition-colors hover:bg-[var(--surface-1)]"
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderTop: "1px solid var(--line-strong)",
                  background: p.id === activeId ? "var(--cykan-surface)" : "transparent",
                }}
              >
                <div className="t-11 font-medium text-[var(--text-soft)]">
                  {p.name}
                  {p.isDefault ? (
                    <span
                      className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]"
                      style={{ marginLeft: "var(--space-2)" }}
                    >
                      DEFAULT
                    </span>
                  ) : null}
                </div>
                {p.description ? (
                  <div className="t-9 text-[var(--text-ghost)] truncate">
                    {p.description}
                  </div>
                ) : null}
                {(p.tone || p.surface) && (
                  <div className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
                    {p.tone ?? "—"} {p.surface ? `· ${p.surface}` : ""}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

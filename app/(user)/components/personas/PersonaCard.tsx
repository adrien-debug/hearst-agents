"use client";

/**
 * <PersonaCard> — carte persona dans la grille /personas.
 *
 * Extrait depuis personas/page.tsx (569 lignes → 480) pour rendre la page
 * lisible et permettre la mémoisation par persona. Stateless ; tous les
 * callbacks viennent du parent.
 */

import type { Persona } from "@/lib/personas/types";

interface PersonaCardProps {
  persona: Persona;
  busy: boolean;
  onEdit: (persona: Persona) => void;
  onRemove: (persona: Persona) => void;
  onPublish: (persona: Persona) => void;
}

export function PersonaCard({
  persona,
  busy,
  onEdit,
  onRemove,
  onPublish,
}: PersonaCardProps) {
  const isBuiltin = persona.id.startsWith("builtin:");

  return (
    <li
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: persona.isDefault
          ? "1px solid var(--cykan)"
          : "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: persona.isDefault ? "var(--cykan-surface)" : "var(--bg-elev)",
      }}
    >
      <header
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-2)" }}
      >
        <span className="t-13 font-medium text-[var(--text)]">{persona.name}</span>
        {persona.isDefault && (
          <span className="t-11 font-medium text-[var(--cykan)]">Par défaut</span>
        )}
      </header>
      {persona.description && (
        <p className="t-11 text-[var(--text-muted)]">{persona.description}</p>
      )}
      <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
        {persona.tone && <Chip>{persona.tone}</Chip>}
        {persona.surface && <Chip>surface · {persona.surface}</Chip>}
        {isBuiltin && <Chip>builtin</Chip>}
      </div>
      <div
        className="flex items-center"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}
      >
        <button
          type="button"
          onClick={() => onEdit(persona)}
          disabled={isBuiltin || busy}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors duration-base"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          Éditer
        </button>
        <button
          type="button"
          onClick={() => onRemove(persona)}
          disabled={isBuiltin || busy}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors duration-base"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={() => onPublish(persona)}
          disabled={busy}
          className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors duration-base"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          Publier
        </button>
      </div>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="t-11 font-light text-[var(--text-faint)]"
      style={{
        padding: "var(--space-1) var(--space-2)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {children}
    </span>
  );
}

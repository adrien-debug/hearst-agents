"use client";

/**
 * WorkingDocument — Panneau "document de travail" du Thinking Canvas.
 *
 * Rendu à droite du chat quand `useWorkingDocumentStore.isOpen === true`.
 * Le user peut :
 *   - éditer le titre inline (input)
 *   - éditer le contenu markdown (textarea pleine hauteur)
 *   - sauvegarder comme asset (footer)
 *   - convertir en mission (footer)
 *   - réduire le panneau (header "← Réduire")
 *
 * Contrat d'ouverture : écoute `window` event `chat:expand-block`
 * (CustomEvent<{ id: string; title: string; content: string }>) émis par
 * le BlockActions du Lot A. Tant que le Lot A n'est pas livré, le panneau
 * peut aussi être ouvert programmaticquement via le store
 * (`useWorkingDocumentStore.getState().open(...)`).
 *
 * Width : `min(50%, 720px)` — split 50/50 desktop, max 720 pour lecture
 *   confortable.
 * Animation : slide-in 200ms ease-out depuis la droite (token motion).
 */

import { useEffect, useRef } from "react";
import { useWorkingDocumentStore } from "@/stores/working-document";

export interface ExpandBlockDetail {
  id: string;
  title: string;
  content: string;
}

export function WorkingDocument() {
  const isOpen = useWorkingDocumentStore((s) => s.isOpen);
  const current = useWorkingDocumentStore((s) => s.current);
  const open = useWorkingDocumentStore((s) => s.open);
  const close = useWorkingDocumentStore((s) => s.close);
  const updateContent = useWorkingDocumentStore((s) => s.updateContent);
  const updateTitle = useWorkingDocumentStore((s) => s.updateTitle);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Listener event `chat:expand-block` — émis par le BlockActions.Expand
  // du Lot A quand l'utilisateur expand un block AI.
  useEffect(() => {
    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<ExpandBlockDetail>).detail;
      if (!detail) return;
      open({
        title: detail.title,
        content: detail.content,
        sourceMessageId: detail.id,
      });
    };
    window.addEventListener("chat:expand-block", onExpand as EventListener);
    return () => {
      window.removeEventListener("chat:expand-block", onExpand as EventListener);
    };
  }, [open]);

  if (!isOpen || !current) return null;

  return (
    <aside
      className="flex flex-col flex-shrink-0 min-h-0 working-document-panel"
      style={{
        width: "min(50%, 720px)",
        background: "var(--bg-center)",
        borderLeft: "1px solid var(--border-shell)",
        animation: "wd-slide-in var(--duration-slow) var(--ease-out-soft)",
      }}
      aria-label="Document de travail"
    >
      <style jsx>{`
        @keyframes wd-slide-in {
          from {
            transform: translateX(24px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Header — titre éditable + bouton réduire */}
      <header
        className="flex items-center justify-between gap-4 flex-shrink-0"
        style={{
          padding: "var(--space-12) var(--space-12) var(--space-6) var(--space-12)",
          borderBottom: "1px solid var(--border-shell)",
        }}
      >
        <input
          ref={titleInputRef}
          type="text"
          value={current.title}
          onChange={(e) => updateTitle(e.target.value)}
          className="flex-1 min-w-0 bg-transparent outline-none halo-title-xl truncate"
          style={{ color: "var(--text)" }}
          placeholder="Sans titre"
          aria-label="Titre du document"
        />
        <button
          onClick={close}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-11 font-light border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          title="Réduire (Cmd+B)"
          type="button"
        >
          <span>← Réduire</span>
          <span className="t-9 font-mono tabular-nums opacity-60">⌘B</span>
        </button>
      </header>

      {/* Body — contenu markdown éditable */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ padding: "var(--space-8) var(--space-12)" }}
      >
        <textarea
          value={current.content}
          onChange={(e) => updateContent(e.target.value)}
          className="w-full h-full min-h-0 bg-transparent outline-none resize-none t-15 leading-relaxed"
          style={{
            color: "var(--text)",
            minHeight: "var(--space-16)",
            fontFamily: "var(--font-satoshi), system-ui, sans-serif",
          }}
          aria-label="Contenu du document"
          placeholder="Le contenu du block apparaîtra ici…"
        />
      </div>

      {/* Footer — actions */}
      <footer
        className="flex items-center justify-end gap-3 flex-shrink-0"
        style={{
          padding: "var(--space-6) var(--space-12) var(--space-12) var(--space-12)",
          borderTop: "1px solid var(--border-shell)",
        }}
      >
        <button
          type="button"
          className="halo-on-hover inline-flex items-center px-3 py-1.5 t-11 font-light border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all"
          title="Sauvegarder ce document comme asset réutilisable"
        >
          Sauvegarder comme asset
        </button>
        <button
          type="button"
          className="halo-on-hover inline-flex items-center px-3 py-1.5 t-11 font-light border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all"
          title="Convertir ce document en mission planifiée"
        >
          Convertir en mission
        </button>
      </footer>
    </aside>
  );
}

"use client";

/**
 * /archive — Historique plein écran.
 *
 * Liste tous les threads (et plus tard : assets, missions complétées,
 * KG entries notables) avec recherche. Accédé via :
 *  - TimelineRail → "Voir l'historique" (lien Archive)
 *  - Commandeur Cmd+K → "Voir l'archive"
 *  - URL directe /archive
 *
 * V1 (Phase A) : threads uniquement avec recherche locale.
 * V2 : assets, missions, KG entries unifiés dans une vue temporelle.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { PageHeader } from "../components/PageHeader";

const FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // Stable serveur ↔ client : sans cette option, le rendu SSR (UTC) diverge
  // du rendu client (timezone locale) → hydration mismatch + blink.
  timeZone: "Europe/Paris",
});

export default function ArchivePage() {
  const router = useRouter();
  const threads = useNavigationStore((s) => s.threads);
  const setActiveThread = useNavigationStore((s) => s.setActiveThread);
  const setStageMode = useStageStore((s) => s.setMode);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...threads].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
    if (!q) return sorted;
    return sorted.filter((t) => t.name.toLowerCase().includes(q));
  }, [threads, query]);

  const handleOpen = (threadId: string) => {
    setActiveThread(threadId);
    setStageMode({ mode: "chat", threadId });
    router.push("/");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <PageHeader
        title="Archive"
        subtitle={`${filtered.length.toString().padStart(3, "0")} entrées`}
        actions={
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-3 py-1.5 t-11 font-light border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          >
            <span>Retour</span>
            <span className="t-9 font-mono tabular-nums opacity-60">ESC</span>
          </button>
        }
      />

      <div className="px-12 py-6 border-b border-[var(--surface-2)] flex-shrink-0">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher dans l'archive…"
          className="w-full bg-transparent t-15 text-[var(--text)] placeholder-[var(--text-faint)] outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="t-15 font-light text-[var(--text-soft)]">
              {query ? "Aucun résultat" : "Archive vide"}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-12 py-6 space-y-2">
            {filtered.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleOpen(thread.id)}
                className="w-full text-left group flex items-baseline gap-6 py-3 px-4 -mx-4 hover:bg-[var(--surface-1)] transition-colors"
              >
                <span className="t-9 font-mono tabular-nums text-[var(--text-ghost)] shrink-0" style={{ width: "var(--space-20)" }}>
                  {thread.lastActivity ? FORMATTER.format(new Date(thread.lastActivity)) : "—"}
                </span>
                <span className="flex-1 t-15 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate">
                  {thread.name}
                </span>
                <span className="t-11 font-light text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  OUVRIR →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useStageStore } from "@/stores/stage";

interface KnowledgeStageProps {
  entityId?: string;
  query?: string;
}

/**
 * KnowledgeStage — Knowledge Graph privé visualisable et queryable.
 *
 * V1 (Phase A) : empty state. Phase B branchera Cytoscape.js graph view
 * + Letta/Zep mémoire + tool `query_memory` (langage naturel → réponse
 * structurée avec entities + edges).
 *
 * Architecture KG :
 *  - Tables `kg_nodes` (Person, Company, Project, Decision, Commitment)
 *  - Tables `kg_edges` (relations typées : works_at, mentioned, owns…)
 *  - Job `memory-ingest` : tout asset/conversation → extraction entities
 *    via LLM → ingest dans le KG en background.
 */
export function KnowledgeStage({ entityId, query }: KnowledgeStageProps) {
  const back = useStageStore((s) => s.back);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-4">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">KNOWLEDGE_GRAPH</span>
          {entityId && (
            <>
              <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">{entityId.slice(0, 16)}</span>
            </>
          )}
          {query && (
            <>
              <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
              <span className="t-9 font-mono italic text-[var(--text-muted)]">« {query.slice(0, 40)}... »</span>
            </>
          )}
        </div>
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
        >
          <span>Retour</span>
          <span className="opacity-60">⌘⌫</span>
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md" style={{ rowGap: "var(--space-6)", display: "flex", flexDirection: "column" }}>
          <span
            className="block text-[var(--cykan)] opacity-30 halo-cyan-md mx-auto t-34"
            style={{ height: "var(--height-stage-empty-icon)" }}
            aria-hidden
          >
            ◈
          </span>
          <p className="t-15 font-medium tracking-tight text-[var(--text)]" style={{ lineHeight: "var(--leading-snug)" }}>
            Knowledge Graph en construction
          </p>
          <p className="t-13 text-[var(--text-muted)]" style={{ lineHeight: "var(--leading-base)" }}>
            À chaque conversation, meeting ou rapport, l{"'"}agent extrait les entités (personnes, sociétés, projets, décisions) et les connecte. Bientôt, tu pourras explorer ton graphe personnel et demander : <span className="text-[var(--cykan)]">{"« qu'est-ce que je sais sur Marc Dupont ? »"}</span>.
          </p>
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] mt-4">
            CMD+L pour ouvrir le chat
          </p>
        </div>
      </div>
    </div>
  );
}

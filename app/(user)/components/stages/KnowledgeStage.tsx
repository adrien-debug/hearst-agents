"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { toast } from "@/app/hooks/use-toast";
import type { KgEdge, KgNode } from "@/lib/memory/kg";

interface KnowledgeStageProps {
  entityId?: string;
  query?: string;
}

// Cytoscape touche `document` au mount → SSR-incompatible. On dynamic
// import côté client uniquement. La déclaration de module se trouve dans
// types/react-cytoscapejs.d.ts (le package ne ship pas de .d.ts).
const CytoscapeComponent = dynamic(() => import("react-cytoscapejs"), { ssr: false });

interface CytoscapeElement {
  data: Record<string, unknown>;
  classes?: string;
}

interface CytoscapeStyleEntry {
  selector: string;
  style: Record<string, unknown>;
}

interface CytoscapeCoreLike {
  on: (event: string, selector: string, handler: (evt: { target: { id: () => string } }) => void) => void;
}

type Phase = "loading" | "empty" | "ready";

const NODE_COLOR_BY_TYPE: Record<string, string> = {
  person: "var(--cykan)",
  company: "var(--warn)",
  project: "var(--text-muted)",
  decision: "var(--danger)",
  commitment: "var(--danger)",
  topic: "var(--text-faint)",
};

function colorForType(type: string): string {
  return NODE_COLOR_BY_TYPE[type] ?? NODE_COLOR_BY_TYPE.topic;
}

export function KnowledgeStage({ entityId, query }: KnowledgeStageProps) {
  const back = useStageStore((s) => s.back);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const messagesByThread = useNavigationStore((s) => s.messages);

  const [phase, setPhase] = useState<Phase>("loading");
  const [graph, setGraph] = useState<{ nodes: KgNode[]; edges: KgEdge[] }>({ nodes: [], edges: [] });
  const [ingesting, setIngesting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchGraph = useCallback(async (): Promise<{ nodes: KgNode[]; edges: KgEdge[] } | null> => {
    try {
      const res = await fetch("/api/v2/kg/graph", { credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as { nodes?: KgNode[]; edges?: KgEdge[] };
      return {
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchGraph();
      if (cancelled) return;
      if (!data) {
        setPhase("empty");
        return;
      }
      setGraph(data);
      setPhase(data.nodes.length === 0 ? "empty" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchGraph]);

  const ingestActiveThread = useCallback(async () => {
    if (!activeThreadId) return;
    const messages = messagesByThread[activeThreadId] ?? [];
    const text = messages
      .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
      .join("\n\n")
      .trim();
    if (!text) {
      toast.info("Thread vide", "Aucun message à analyser dans ce thread.");
      return;
    }

    setIngesting(true);
    try {
      const res = await fetch("/api/v2/kg/ingest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        entitiesCreated?: number;
        edgesCreated?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error("Échec ingestion", data.message || data.error || "Erreur inconnue");
        return;
      }
      toast.info(
        "Graphe enrichi",
        `${data.entitiesCreated ?? 0} entité(s), ${data.edgesCreated ?? 0} relation(s)`,
      );
      const refreshed = await fetchGraph();
      if (refreshed) {
        setGraph(refreshed);
        setPhase(refreshed.nodes.length === 0 ? "empty" : "ready");
      }
    } catch (err) {
      toast.error("Erreur réseau", err instanceof Error ? err.message : String(err));
    } finally {
      setIngesting(false);
    }
  }, [activeThreadId, messagesByThread, fetchGraph]);

  const elements = useMemo<CytoscapeElement[]>(() => {
    const nodeEls: CytoscapeElement[] = graph.nodes.map((n) => ({
      data: { id: n.id, label: n.label, type: n.type },
      classes: `kg-node kg-node-${n.type}`,
    }));
    const edgeEls: CytoscapeElement[] = graph.edges.map((e) => ({
      data: { id: e.id, source: e.source_id, target: e.target_id, label: e.type },
      classes: "kg-edge",
    }));
    return [...nodeEls, ...edgeEls];
  }, [graph]);

  const stylesheet = useMemo<CytoscapeStyleEntry[]>(
    () => [
      {
        selector: "node",
        style: {
          "background-color": "var(--text-faint)",
          "label": "data(label)",
          "color": "var(--text)",
          "font-size": 11,
          "font-family": "var(--font-satoshi), sans-serif",
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 6,
          "width": 28,
          "height": 28,
          "border-width": 1,
          "border-color": "var(--surface-2)",
        },
      },
      ...Object.entries(NODE_COLOR_BY_TYPE).map(([type, color]) => ({
        selector: `node.kg-node-${type}`,
        style: { "background-color": color },
      })),
      {
        selector: "node:selected",
        style: {
          "border-width": 2,
          "border-color": "var(--cykan)",
        },
      },
      {
        selector: "edge",
        style: {
          "width": 1,
          "line-color": "var(--surface-2)",
          "target-arrow-color": "var(--surface-2)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
        },
      },
    ],
    [],
  );

  const layout = useMemo(() => ({ name: "cose", animate: false, idealEdgeLength: 100 }), []);

  const onCyInit = useCallback(
    (cy: unknown) => {
      const core = cy as CytoscapeCoreLike;
      core.on("tap", "node", (evt) => {
        setSelectedNodeId(evt.target.id());
      });
      core.on("tap", "core", () => {
        // Désélectionner si on clique sur le fond. La condition « tap sur
        // core sans node » est gérée par Cytoscape via le selector "core".
        setSelectedNodeId(null);
      });
    },
    [],
  );

  const selectedNode = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-4">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            KNOWLEDGE_GRAPH
          </span>
          {entityId && (
            <>
              <span
                className="rounded-pill bg-[var(--text-ghost)]"
                style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              />
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
                {entityId.slice(0, 16)}
              </span>
            </>
          )}
          {query && (
            <>
              <span
                className="rounded-pill bg-[var(--text-ghost)]"
                style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              />
              <span className="t-9 font-mono italic text-[var(--text-muted)]">
                « {query.slice(0, 40)}... »
              </span>
            </>
          )}
          {phase === "ready" && (
            <>
              <span
                className="rounded-pill bg-[var(--text-ghost)]"
                style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              />
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
                {graph.nodes.length} ENT · {graph.edges.length} REL
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase === "ready" && (
            <button
              type="button"
              onClick={() => void ingestActiveThread()}
              disabled={ingesting || !activeThreadId}
              className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-muted)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ingesting ? "Extraction…" : "Ingest thread"}
            </button>
          )}
          <button
            onClick={back}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          >
            <span>Retour</span>
            <span className="opacity-60">⌘⌫</span>
          </button>
        </div>
      </header>

      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <span
              className="rounded-pill bg-[var(--warn)] animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-11 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
              Chargement du graphe…
            </span>
          </div>
        </div>
      )}

      {phase === "empty" && (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-md flex flex-col gap-6">
            <span
              className="block text-[var(--cykan)] opacity-30 halo-cyan-md mx-auto t-34"
              style={{ height: "var(--height-stage-empty-icon)" }}
              aria-hidden
            >
              ◈
            </span>
            <p
              className="t-15 font-medium tracking-tight text-[var(--text)]"
              style={{ lineHeight: "var(--leading-snug)" }}
            >
              Aucune entité extraite
            </p>
            <p
              className="t-13 text-[var(--text-muted)]"
              style={{ lineHeight: "var(--leading-base)" }}
            >
              Ingest le thread actif pour démarrer ton graphe. L{"'"}agent extrait
              personnes, entreprises, projets, décisions et engagements.
            </p>
            <button
              type="button"
              onClick={() => void ingestActiveThread()}
              disabled={ingesting || !activeThreadId}
              className="halo-on-hover px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ingesting ? "Extraction…" : "Ingest le thread actif"}
            </button>
            {!activeThreadId && (
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                Sélectionne un thread d{"'"}abord
              </p>
            )}
          </div>
        </div>
      )}

      {phase === "ready" && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="flex-1 min-h-0">
            <CytoscapeComponent
              elements={elements}
              layout={layout}
              stylesheet={stylesheet}
              cy={onCyInit}
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          {selectedNode && (
            <aside
              className="border-t border-[var(--surface-2)] bg-[var(--bg-elev)] flex flex-col gap-3"
              style={{ padding: "var(--space-6) var(--space-12)" }}
            >
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-pill"
                    style={{
                      width: "var(--space-2)",
                      height: "var(--space-2)",
                      background: colorForType(selectedNode.type),
                    }}
                    aria-hidden
                  />
                  <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                    {selectedNode.type}
                  </span>
                  <span className="t-15 font-medium text-[var(--text)]">
                    {selectedNode.label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="t-13 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                  aria-label="Fermer le panneau"
                >
                  ×
                </button>
              </header>
              {Object.keys(selectedNode.properties ?? {}).length > 0 && (
                <pre className="t-11 font-mono text-[var(--text-muted)] whitespace-pre-wrap">
                  {JSON.stringify(selectedNode.properties, null, 2)}
                </pre>
              )}
            </aside>
          )}

          <footer
            className="flex-shrink-0 border-t border-[var(--surface-2)] flex items-center justify-center"
            style={{ padding: "var(--space-3) var(--space-8)" }}
          >
            <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              Letta + Zep en Phase B — vector search + raisonnement long terme
            </p>
          </footer>
        </div>
      )}
    </div>
  );
}

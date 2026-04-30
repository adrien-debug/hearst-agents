"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { useStageData } from "@/stores/stage-data";
import { toast } from "@/app/hooks/use-toast";
import { StageActionBar, type StageAction } from "./StageActionBar";
import { KgQueryBar } from "../kg/KgQueryBar";
import { KgNodeDetail } from "../kg/KgNodeDetail";
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
  project: "var(--accent-llm)",
  decision: "var(--danger)",
  commitment: "var(--color-success)",
  topic: "var(--text-muted)",
};

export function KnowledgeStage({ entityId, query }: KnowledgeStageProps) {
  const back = useStageStore((s) => s.back);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const messagesByThread = useNavigationStore((s) => s.messages);

  const [phase, setPhase] = useState<Phase>("loading");
  const [graph, setGraph] = useState<{ nodes: KgNode[]; edges: KgEdge[] }>({ nodes: [], edges: [] });
  const [ingesting, setIngesting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(entityId ?? null);

  // Search state
  const [searchHits, setSearchHits] = useState<Set<string> | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Path finder state
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [pathTo, setPathTo] = useState<string | null>(null);
  const [pathNodes, setPathNodes] = useState<Set<string>>(new Set());
  const [pathEdges, setPathEdges] = useState<Set<string>>(new Set());
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMessage, setPathMessage] = useState<string | null>(null);

  // Sync vers stage-data pour ContextRailForKnowledge.
  const setKgSlice = useStageData((s) => s.setKg);
  useEffect(() => {
    const selected = selectedNodeId
      ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;
    setKgSlice({ graph, selectedNode: selected });
  }, [graph, selectedNodeId, setKgSlice]);

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

  // ── Search ─────────────────────────────────────────────
  const handleSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/v2/kg/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setSearchHits(new Set());
        return;
      }
      const data = (await res.json()) as { nodes?: Array<{ id: string }> };
      const ids = new Set((data.nodes ?? []).map((n) => n.id));
      setSearchHits(ids);
      if (ids.size === 0) {
        toast.info("Aucun résultat", `Pas d'entité matching "${q}"`);
      }
    } catch {
      setSearchHits(new Set());
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchHits(null);
  }, []);

  // ── Path finder ────────────────────────────────────────
  const handlePickPath = useCallback((role: "from" | "to", nodeId: string) => {
    if (role === "from") setPathFrom(nodeId);
    else setPathTo(nodeId);
    setPathMessage(null);
  }, []);

  const handleResetPath = useCallback(() => {
    setPathFrom(null);
    setPathTo(null);
    setPathNodes(new Set());
    setPathEdges(new Set());
    setPathMessage(null);
  }, []);

  const handleFindPath = useCallback(async () => {
    if (!pathFrom || !pathTo) return;
    setPathLoading(true);
    setPathMessage(null);
    try {
      const url = `/api/v2/kg/path?from=${encodeURIComponent(pathFrom)}&to=${encodeURIComponent(pathTo)}&maxHops=4`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        setPathMessage("Erreur réseau");
        return;
      }
      const data = (await res.json()) as {
        path?: { nodes: KgNode[]; edges: KgEdge[]; hops: number } | null;
      };
      if (!data.path) {
        setPathNodes(new Set());
        setPathEdges(new Set());
        setPathMessage("Aucun chemin trouvé sous 4 sauts");
        return;
      }
      setPathNodes(new Set(data.path.nodes.map((n) => n.id)));
      setPathEdges(new Set(data.path.edges.map((e) => e.id)));
      setPathMessage(`Chemin trouvé en ${data.path.hops} saut(s)`);
    } catch {
      setPathMessage("Erreur");
    } finally {
      setPathLoading(false);
    }
  }, [pathFrom, pathTo]);

  // ── Cytoscape elements ─────────────────────────────────
  const elements = useMemo<CytoscapeElement[]>(() => {
    const nodeEls: CytoscapeElement[] = graph.nodes.map((n) => {
      const classes: string[] = ["kg-node", `kg-node-${n.type}`];
      if (searchHits && !searchHits.has(n.id)) classes.push("kg-node-dim");
      if (searchHits && searchHits.has(n.id)) classes.push("kg-node-hit");
      if (pathNodes.has(n.id)) classes.push("kg-node-path");
      return {
        data: { id: n.id, label: n.label, type: n.type },
        classes: classes.join(" "),
      };
    });
    const edgeEls: CytoscapeElement[] = graph.edges.map((e) => {
      const classes: string[] = ["kg-edge"];
      if (pathEdges.has(e.id)) classes.push("kg-edge-path");
      return {
        data: { id: e.id, source: e.source_id, target: e.target_id, label: e.type },
        classes: classes.join(" "),
      };
    });
    return [...nodeEls, ...edgeEls];
  }, [graph, searchHits, pathNodes, pathEdges]);

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
        selector: "node.kg-node-dim",
        style: { opacity: 0.25 },
      },
      {
        selector: "node.kg-node-hit",
        style: {
          "border-width": 2,
          "border-color": "var(--cykan)",
          "border-style": "double",
        },
      },
      {
        selector: "node.kg-node-path",
        style: {
          "border-width": 3,
          "border-color": "var(--warn)",
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
      {
        selector: "edge.kg-edge-path",
        style: {
          "width": 2.5,
          "line-color": "var(--warn)",
          "target-arrow-color": "var(--warn)",
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
        setSelectedNodeId(null);
      });
    },
    [],
  );

  const selectedNode = selectedNodeId
    ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const fromLabel = pathFrom ? graph.nodes.find((n) => n.id === pathFrom)?.label : null;
  const toLabel = pathTo ? graph.nodes.find((n) => n.id === pathTo)?.label : null;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <StageActionBar
        context={
          <>
            <span className="t-11 font-medium text-[var(--cykan)]">
              KNOWLEDGE
            </span>
            {entityId && (
              <>
                <span
                  className="rounded-pill bg-[var(--text-ghost)]"
                  style={{ width: "var(--space-1)", height: "var(--space-1)" }}
                />
                <span className="t-11 font-light text-[var(--text-muted)]">
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
                <span className="t-11 font-light text-[var(--text-muted)]">
                  {graph.nodes.length} ENT · {graph.edges.length} REL
                </span>
              </>
            )}
          </>
        }
        secondary={
          phase === "ready"
            ? [
                {
                  id: "ingest",
                  label: ingesting ? "Extraction…" : "Ingest thread",
                  onClick: () => void ingestActiveThread(),
                  disabled: ingesting || !activeThreadId,
                  loading: ingesting,
                } satisfies StageAction,
              ]
            : []
        }
        onBack={back}
      />

      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <span
              className="rounded-pill bg-[var(--warn)] animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-11 font-light text-[var(--text-muted)]">
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
              className="px-6 py-3 t-13 font-medium bg-[var(--cykan)] text-[var(--text-on-cykan)] transition-colors duration-base hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ingesting ? "Extraction…" : "Ingest le thread actif"}
            </button>
            {!activeThreadId && (
              <p className="t-11 font-light text-[var(--text-faint)]">
                Sélectionne un thread d{"'"}abord
              </p>
            )}
          </div>
        </div>
      )}

      {phase === "ready" && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div
            className="flex flex-col gap-3 border-b border-[var(--border-default)]"
            style={{ padding: "var(--space-4) var(--space-12)" }}
          >
            <KgQueryBar
              onSearch={(q) => void handleSearch(q)}
              onClear={handleClearSearch}
              loading={searchLoading}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="t-11 font-light text-[var(--text-faint)]">
                Chemin :
              </span>
              <span
                className="t-11 font-light text-[var(--text-soft)] truncate"
                style={{ maxWidth: "var(--space-32)" }}
              >
                {fromLabel ? `↦ ${fromLabel}` : "départ ?"}
              </span>
              <span className="t-9 font-mono text-[var(--text-faint)]">→</span>
              <span
                className="t-11 font-light text-[var(--text-soft)] truncate"
                style={{ maxWidth: "var(--space-32)" }}
              >
                {toLabel ?? "arrivée ?"}
              </span>
              <button
                type="button"
                onClick={() => void handleFindPath()}
                disabled={!pathFrom || !pathTo || pathLoading}
                className="t-11 font-medium text-[var(--cykan)] disabled:opacity-50"
                style={{ transitionProperty: "letter-spacing", transitionDuration: "var(--duration-slow)" }}
              >
                {pathLoading ? "…" : "Trouver chemin"}
              </button>
              {(pathFrom || pathTo) && (
                <button
                  type="button"
                  onClick={handleResetPath}
                  className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                >
                  Reset
                </button>
              )}
              {pathMessage && (
                <span className="t-11 font-medium text-[var(--warn)]">
                  {pathMessage}
                </span>
              )}
            </div>
          </div>

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
            <KgNodeDetail
              node={selectedNode}
              edges={graph.edges}
              nodes={graph.nodes}
              onClose={() => setSelectedNodeId(null)}
              onPickPath={handlePickPath}
            />
          )}

          <footer
            className="flex-shrink-0 border-t border-[var(--border-default)] flex items-center justify-center"
            style={{ padding: "var(--space-3) var(--space-8)" }}
          >
            <p className="t-11 font-light text-[var(--text-faint)]">
              Letta + Zep en Phase B — vector search + raisonnement long terme
            </p>
          </footer>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * KgMiniGraph — Cytoscape compact (≤ 10 nodes) pour ContextRail Chat.
 * Affiche les entités contextuelles du Knowledge Graph user-scoped.
 *
 * - dynamic import comme dans KnowledgeStage (Cytoscape touche `document` au mount)
 * - layout breadthfirst (compact, lisible 320px width)
 * - couleur par type (person=cykan, company=warn, project=accent-llm, …)
 * - click sur un node → setMode({ mode: "kg", entityId }) : ouvre KnowledgeStage focused
 * - empty state si pas de nodes
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useStageStore } from "@/stores/stage";
import type { KgEdge, KgNode } from "@/lib/memory/kg";

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

const NODE_COLOR: Record<string, string> = {
  person: "var(--cykan)",
  company: "var(--warn)",
  project: "var(--accent-llm)",
  decision: "var(--danger)",
  commitment: "var(--color-success)",
  topic: "var(--text-muted)",
};

const MAX_NODES = 10;

interface KgMiniGraphProps {
  /** Optionnel : limiter le mini-graph aux entités liées à ce thread.
   * Non implémenté côté backend pour l'instant — réservé pour une future
   * jointure thread→nodes. Pour le MVP, on prend les top N nodes les plus
   * récents de l'utilisateur. */
  threadId?: string | null;
}

export function KgMiniGraph({ threadId }: KgMiniGraphProps) {
  const setMode = useStageStore((s) => s.setMode);
  const [nodes, setNodes] = useState<KgNode[]>([]);
  const [edges, setEdges] = useState<KgEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = threadId
          ? `/api/v2/kg/graph?threadId=${encodeURIComponent(threadId)}`
          : "/api/v2/kg/graph";
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { nodes?: KgNode[]; edges?: KgEdge[] };
        if (cancelled) return;
        const allNodes = Array.isArray(data.nodes) ? data.nodes : [];
        const sorted = [...allNodes].sort((a, b) => {
          const aT = Date.parse(a.updated_at) || 0;
          const bT = Date.parse(b.updated_at) || 0;
          return bT - aT;
        });
        const top = sorted.slice(0, MAX_NODES);
        const topIds = new Set(top.map((n) => n.id));
        const allEdges = Array.isArray(data.edges) ? data.edges : [];
        const filtered = allEdges.filter(
          (e) => topIds.has(e.source_id) && topIds.has(e.target_id),
        );
        setNodes(top);
        setEdges(filtered);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const elements = useMemo<CytoscapeElement[]>(() => {
    const ne: CytoscapeElement[] = nodes.map((n) => ({
      data: { id: n.id, label: n.label, type: n.type },
      classes: `kgmini-node kgmini-node-${n.type}`,
    }));
    const ee: CytoscapeElement[] = edges.map((e) => ({
      data: { id: e.id, source: e.source_id, target: e.target_id, label: e.type },
      classes: "kgmini-edge",
    }));
    return [...ne, ...ee];
  }, [nodes, edges]);

  const stylesheet = useMemo<CytoscapeStyleEntry[]>(
    () => [
      {
        selector: "node",
        style: {
          "background-color": "var(--text-faint)",
          "label": "data(label)",
          "color": "var(--text-soft)",
          "font-size": 9,
          "font-family": "var(--font-satoshi), sans-serif",
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 4,
          "width": 18,
          "height": 18,
        },
      },
      ...Object.entries(NODE_COLOR).map(([type, color]) => ({
        selector: `node.kgmini-node-${type}`,
        style: { "background-color": color },
      })),
      {
        selector: "edge",
        style: {
          "width": 1,
          "line-color": "var(--surface-2, var(--border-default))",
          "curve-style": "bezier",
          "target-arrow-shape": "none",
          "opacity": 0.5,
        },
      },
    ],
    [],
  );

  const layout = useMemo(
    () => ({ name: "breadthfirst", animate: false, padding: 8, spacingFactor: 0.9 }),
    [],
  );

  const onCyInit = (cy: unknown) => {
    const core = cy as CytoscapeCoreLike;
    core.on("tap", "node", (evt) => {
      const id = evt.target.id();
      setMode({ mode: "kg", entityId: id });
    });
  };

  if (loading) {
    return (
      <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
        Chargement…
      </p>
    );
  }

  if (error) {
    return (
      <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
        Erreur — KG indisponible
      </p>
    );
  }

  if (nodes.length === 0) {
    return (
      <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
        Aucune entité détectée pour ce thread
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="border border-[var(--border-default)] rounded-md overflow-hidden bg-[var(--surface-card)]"
        style={{ height: "var(--space-32)" }}
      >
        <CytoscapeComponent
          elements={elements}
          layout={layout}
          stylesheet={stylesheet}
          cy={onCyInit}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <button
        type="button"
        onClick={() => setMode({ mode: "kg" })}
        className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] hover:tracking-[0.4em] self-start"
        style={{ transitionProperty: "letter-spacing", transitionDuration: "var(--duration-slow)" }}
      >
        Voir le graphe complet →
      </button>
    </div>
  );
}

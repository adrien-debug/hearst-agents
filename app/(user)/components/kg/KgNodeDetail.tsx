"use client";

/**
 * KgNodeDetail — panneau latéral détail d'un node sélectionné dans le KG.
 * Affiche : type, label, properties, edges in/out (count), et bouton
 * "Voir la timeline" qui charge les events liés.
 */

import { useState } from "react";
import type { KgEdge, KgNode, TimelineEvent } from "@/lib/memory/kg";

interface KgNodeDetailProps {
  node: KgNode;
  edges: KgEdge[];
  nodes: KgNode[];
  onClose: () => void;
  onPickPath?: (role: "from" | "to", nodeId: string) => void;
}

const TYPE_COLOR: Record<string, string> = {
  person: "var(--cykan)",
  company: "var(--warn)",
  project: "var(--accent-llm)",
  decision: "var(--danger)",
  commitment: "var(--color-success)",
  topic: "var(--text-muted)",
};

export function KgNodeDetail({ node, edges, nodes, onClose, onPickPath }: KgNodeDetailProps) {
  const [timelineState, setTimelineState] = useState<{
    nodeId: string;
    events: TimelineEvent[] | null;
  }>({ nodeId: node.id, events: null });
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Reset implicite : si la prop node change, on ignore l'ancien timeline.
  const timeline = timelineState.nodeId === node.id ? timelineState.events : null;

  const incoming = edges.filter((e) => e.target_id === node.id);
  const outgoing = edges.filter((e) => e.source_id === node.id);

  const nodeById = new Map<string, KgNode>(nodes.map((n) => [n.id, n]));

  const loadTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const res = await fetch(
        `/api/v2/kg/timeline?entityId=${encodeURIComponent(node.id)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setTimelineState({ nodeId: node.id, events: [] });
        return;
      }
      const data = (await res.json()) as { events?: TimelineEvent[] };
      setTimelineState({
        nodeId: node.id,
        events: Array.isArray(data.events) ? data.events : [],
      });
    } catch {
      setTimelineState({ nodeId: node.id, events: [] });
    } finally {
      setLoadingTimeline(false);
    }
  };

  const props = (node.properties ?? {}) as Record<string, unknown>;
  const propEntries = Object.entries(props).slice(0, 8);

  return (
    <aside
      className="border-t border-[var(--border-default)] bg-[var(--bg-elev)] flex flex-col gap-4 overflow-y-auto"
      style={{ padding: "var(--space-6) var(--space-12)", maxHeight: "var(--height-focal-min)" }}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="rounded-pill shrink-0"
            style={{
              width: "var(--space-2)",
              height: "var(--space-2)",
              background: TYPE_COLOR[node.type] ?? "var(--text-faint)",
            }}
            aria-hidden
          />
          <span className="t-11 font-light text-[var(--text-faint)] shrink-0">
            {node.type}
          </span>
          <span className="t-15 font-medium text-[var(--text)] truncate">
            {node.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="t-13 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors shrink-0"
          aria-label="Fermer"
        >
          ×
        </button>
      </header>

      {propEntries.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="t-11 font-light text-[var(--text-faint)]">
            Propriétés
          </span>
          <ul className="flex flex-col gap-1">
            {propEntries.map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-3">
                <span className="t-11 font-light text-[var(--text-faint)] truncate" style={{ minWidth: "var(--space-12)" }}>
                  {k}
                </span>
                <span className="t-11 font-light text-[var(--text-muted)] truncate">
                  {String(v)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex items-center gap-6">
        <div className="flex flex-col gap-1">
          <span className="t-11 font-light text-[var(--text-faint)]">
            Entrants
          </span>
          <span className="t-15 font-mono text-[var(--text-soft)]">{incoming.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="t-11 font-light text-[var(--text-faint)]">
            Sortants
          </span>
          <span className="t-15 font-mono text-[var(--text-soft)]">{outgoing.length}</span>
        </div>
      </section>

      {onPickPath && (
        <section className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPickPath("from", node.id)}
            className="t-11 font-light border border-[var(--border-default)] hover:border-[var(--cykan-border)] hover:text-[var(--cykan)] transition-colors text-[var(--text-muted)]"
            style={{ padding: "var(--space-1) var(--space-3)" }}
          >
            Départ chemin
          </button>
          <button
            type="button"
            onClick={() => onPickPath("to", node.id)}
            className="t-11 font-light border border-[var(--border-default)] hover:border-[var(--cykan-border)] hover:text-[var(--cykan)] transition-colors text-[var(--text-muted)]"
            style={{ padding: "var(--space-1) var(--space-3)" }}
          >
            Arrivée chemin
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="t-11 font-light text-[var(--text-faint)]">
            Timeline
          </span>
          {timeline === null && (
            <button
              type="button"
              onClick={() => void loadTimeline()}
              disabled={loadingTimeline}
              className="t-11 font-medium text-[var(--cykan)] disabled:opacity-50"
              style={{ transitionProperty: "letter-spacing", transitionDuration: "var(--duration-slow)" }}
            >
              {loadingTimeline ? "…" : "CHARGER"}
            </button>
          )}
        </div>
        {timeline !== null && timeline.length === 0 && (
          <p className="t-11 font-light text-[var(--text-faint)]">Aucun événement lié.</p>
        )}
        {timeline !== null && timeline.length > 0 && (
          <ul className="flex flex-col gap-2">
            {timeline.slice(0, 8).map((ev) => {
              const related = nodeById.get(ev.relatedNodeId);
              return (
                <li key={ev.id} className="flex items-baseline gap-3">
                  <span
                    className="t-11 font-light shrink-0"
                    style={{ color: TYPE_COLOR[related?.type ?? ev.type] ?? "var(--text-faint)" }}
                  >
                    {related?.type ?? ev.type}
                  </span>
                  <span className="t-11 font-light text-[var(--text-soft)] truncate flex-1">
                    {related?.label ?? ev.label}
                  </span>
                  <span className="t-9 font-mono text-[var(--text-ghost)]">
                    {ev.edgeType}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

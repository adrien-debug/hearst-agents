"use client";

/**
 * WorkflowCanvas — rendu Cytoscape du WorkflowGraph.
 *
 * Cytoscape est dynamique import (SSR-incompatible). On expose :
 * - sélection node (click)
 * - création edge (click sur source puis click sur target avec mode "connect")
 * - move via drag (positions remontées via callback)
 *
 * Pas de drag-create node ici — c'est la palette qui ajoute les nodes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { WorkflowGraph } from "@/lib/workflows/types";

const CytoscapeComponent = dynamic(() => import("react-cytoscapejs"), {
  ssr: false,
});

interface CytoscapeElement {
  data: Record<string, unknown>;
  classes?: string;
  position?: { x: number; y: number };
}

interface CytoscapeStyleEntry {
  selector: string;
  style: Record<string, unknown>;
}

interface NodeRunStatus {
  status: "idle" | "running" | "completed" | "failed" | "awaiting_approval" | "skipped";
}

interface WorkflowCanvasProps {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  onConnect: (source: string, target: string) => void;
  onPositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  /** État runtime des nodes pendant un preview / run pour highlight live. */
  runStatus?: Map<string, NodeRunStatus["status"]>;
}

const NODE_COLOR_BY_KIND: Record<string, string> = {
  trigger: "var(--cykan)",
  tool_call: "var(--accent-llm)",
  condition: "var(--warn)",
  approval: "var(--danger)",
  output: "var(--money)",
  transform: "var(--text-muted)",
};

export function WorkflowCanvas({
  graph,
  selectedNodeId,
  onSelect,
  onConnect,
  onPositionChange,
  runStatus,
}: WorkflowCanvasProps) {
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const cyRef = useRef<unknown | null>(null);

  const elements = useMemo<CytoscapeElement[]>(() => {
    const nodeEls: CytoscapeElement[] = graph.nodes.map((n) => {
      const classes: string[] = ["wf-node", `wf-node-${n.kind}`];
      if (selectedNodeId === n.id) classes.push("wf-node-selected");
      if (pendingSource === n.id) classes.push("wf-node-source");
      const status = runStatus?.get(n.id);
      if (status) classes.push(`wf-node-status-${status}`);
      return {
        data: { id: n.id, label: n.label, kind: n.kind },
        classes: classes.join(" "),
        position: n.position,
      };
    });
    const edgeEls: CytoscapeElement[] = graph.edges.map((e) => {
      const classes: string[] = ["wf-edge"];
      if (e.condition === "true") classes.push("wf-edge-true");
      else if (e.condition === "false") classes.push("wf-edge-false");
      else if (e.condition === "error") classes.push("wf-edge-error");
      return {
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.condition ?? "",
        },
        classes: classes.join(" "),
      };
    });
    return [...nodeEls, ...edgeEls];
  }, [graph, selectedNodeId, pendingSource, runStatus]);

  const stylesheet = useMemo<CytoscapeStyleEntry[]>(
    () => [
      {
        selector: "node",
        style: {
          "background-color": "var(--surface-2)",
          "label": "data(label)",
          "color": "var(--text)",
          "font-size": 11,
          "font-family": "var(--font-satoshi), sans-serif",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": "120px",
          "width": 140,
          "height": 56,
          "shape": "round-rectangle",
          "border-width": 1,
          "border-color": "var(--border-soft)",
          "padding": 8,
        },
      },
      ...Object.entries(NODE_COLOR_BY_KIND).map(([kind, color]) => ({
        selector: `node.wf-node-${kind}`,
        style: { "border-color": color },
      })),
      {
        selector: "node.wf-node-selected",
        style: {
          "border-width": 2,
          "border-color": "var(--cykan)",
        },
      },
      {
        selector: "node.wf-node-source",
        style: {
          "border-width": 2,
          "border-color": "var(--warn)",
          "border-style": "dashed",
        },
      },
      {
        selector: "node.wf-node-status-running",
        style: {
          "background-color": "var(--cykan)",
          "color": "var(--bg)",
        },
      },
      {
        selector: "node.wf-node-status-completed",
        style: {
          "background-color": "var(--money)",
          "color": "var(--bg)",
        },
      },
      {
        selector: "node.wf-node-status-failed",
        style: {
          "background-color": "var(--danger)",
          "color": "var(--bg)",
        },
      },
      {
        selector: "node.wf-node-status-awaiting_approval",
        style: {
          "background-color": "var(--warn)",
          "color": "var(--bg)",
        },
      },
      {
        selector: "node.wf-node-status-skipped",
        style: {
          "opacity": 0.4,
        },
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "var(--border-default)",
          "target-arrow-color": "var(--border-default)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "label": "data(label)",
          "font-size": 9,
          "font-family": "var(--font-satoshi), sans-serif",
          "text-rotation": "autorotate",
          "color": "var(--text-muted)",
          "text-background-color": "var(--bg)",
          "text-background-opacity": 1,
          "text-background-padding": 2,
        },
      },
      {
        selector: "edge.wf-edge-true",
        style: {
          "line-color": "var(--money)",
          "target-arrow-color": "var(--money)",
        },
      },
      {
        selector: "edge.wf-edge-false",
        style: {
          "line-color": "var(--danger)",
          "target-arrow-color": "var(--danger)",
        },
      },
      {
        selector: "edge.wf-edge-error",
        style: {
          "line-color": "var(--warn)",
          "target-arrow-color": "var(--warn)",
          "line-style": "dashed",
        },
      },
    ],
    [],
  );

  // Bind cytoscape events
  useEffect(() => {
    const cy = cyRef.current as unknown as
      | {
          on: (event: string, selector: string | undefined, handler: (...args: unknown[]) => void) => void;
          off: (event: string, selector?: string) => void;
        }
      | null;
    if (!cy) return;

    const handleTapNode = (evt: { target: { id: () => string } }) => {
      const id = evt.target.id();
      if (pendingSource && pendingSource !== id) {
        onConnect(pendingSource, id);
        setPendingSource(null);
        return;
      }
      onSelect(id);
    };

    const handleTapBackground = (evt: { target: unknown }) => {
      // Si target est le `cy` lui-même, c'est un tap sur le fond
      if (evt.target === cy) {
        onSelect(null);
        setPendingSource(null);
      }
    };

    const handleDragFree = (evt: {
      target: { id: () => string; position: () => { x: number; y: number } };
    }) => {
      const id = evt.target.id();
      const pos = evt.target.position();
      onPositionChange(id, { x: pos.x, y: pos.y });
    };

    cy.on("tap", "node", handleTapNode as unknown as (...args: unknown[]) => void);
    cy.on("tap", undefined as unknown as string, handleTapBackground as unknown as (...args: unknown[]) => void);
    cy.on("dragfree", "node", handleDragFree as unknown as (...args: unknown[]) => void);

    return () => {
      cy.off("tap", "node");
      cy.off("tap");
      cy.off("dragfree", "node");
    };
  }, [pendingSource, onConnect, onSelect, onPositionChange]);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: "var(--bg)" }}
    >
      <CytoscapeComponent
        elements={elements}
        layout={{ name: "preset" }}
        stylesheet={stylesheet}
        style={{ width: "100%", height: "100%" }}
        cy={(cy) => {
          cyRef.current = cy;
        }}
      />
      <div
        className="absolute pointer-events-none flex flex-col"
        style={{
          top: "var(--space-3)",
          right: "var(--space-3)",
          gap: "var(--space-2)",
        }}
      >
        <div
          className="t-11 font-light text-[var(--text-faint)] pointer-events-auto rounded-md"
          style={{
            padding: "var(--space-2) var(--space-3)",
            background: "var(--bg-rail)",
            border: "1px solid var(--border-soft)",
          }}
        >
          {pendingSource
            ? "Click un node cible pour connecter"
            : "Click 2 nodes pour créer une edge"}
        </div>
        {selectedNodeId && (
          <button
            type="button"
            onClick={() => {
              if (selectedNodeId === pendingSource) setPendingSource(null);
              else setPendingSource(selectedNodeId);
            }}
            className="t-11 font-light text-[var(--cykan)] pointer-events-auto rounded-md hover:text-[var(--text)] transition-colors"
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg-rail)",
              border: "1px solid var(--cykan)",
            }}
          >
            {pendingSource === selectedNodeId
              ? "Annuler connexion"
              : "Connecter depuis ce node"}
          </button>
        )}
      </div>
    </div>
  );
}

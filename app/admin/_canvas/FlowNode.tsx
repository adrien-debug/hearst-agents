"use client";

import type { CSSProperties } from "react";
import type { CanvasNode } from "./topology";
import { NODES, NODE_SIZE, VIEWBOX } from "./topology";
import { useCanvasStore, type NodeState } from "./store";
import NodeToggle from "./NodeToggle";
import StageIcon from "./icons/StageIcons";

interface Props {
  node: CanvasNode;
  /** Optional micro-metric rendered in the bottom strip ("p50 8ms · 12/min"). */
  metric?: string;
}

const STATE_BADGE: Partial<Record<NodeState, string>> = {
  active: "actif",
  success: "ok",
  failed: "fail",
  blocked: "bloqué",
};

const NODE_INDEX: Record<string, number> = NODES.reduce(
  (acc, n, i) => ({ ...acc, [n.id]: i + 1 }),
  {} as Record<string, number>,
);

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Carte « stage » du pipeline admin — surface holographique en grille 3 rangs :
 *   Row 1 — disque icône · kicker mono · LED voyant
 *   Row 2 — label principal
 *   Row 3 — micro-metric · pastille d'état
 *
 * Toute la matérialité (surface, ombres, ring, glow d'état) vient de la classe
 * `.pipeline-card` dans globals.css. Le composant React ne fait que poser les
 * data-attributes (`data-kind`, `data-state`, `data-selected`) et écrire les
 * variables CSS de position calculées depuis le viewBox.
 */
export default function FlowNode({ node, metric }: Props) {
  const state = useCanvasStore((s) => s.nodeStates[node.id]);
  const setSelected = useCanvasStore((s) => s.setSelectedNodeId);
  const isSelected = useCanvasStore((s) => s.selectedNodeId === node.id);

  // Position + size in % of viewBox so the node layer scales with the canvas.
  // Pass through CSS custom properties — the .pipeline-card class consumes them.
  const cssVars: CSSProperties & Record<string, string> = {
    "--pl-left": `${(node.x / VIEWBOX.width) * 100}%`,
    "--pl-top": `${(node.y / VIEWBOX.height) * 100}%`,
    "--pl-width": `${(NODE_SIZE.w / VIEWBOX.width) * 100}%`,
    "--pl-height": `${(NODE_SIZE.h / VIEWBOX.height) * 100}%`,
  };

  const badge = STATE_BADGE[state];
  const idx = NODE_INDEX[node.id];
  const kicker = `${pad2(idx)} // ${node.sublabel}`;

  return (
    <div
      role="button"
      tabIndex={0}
      data-kind={node.kind}
      data-state={state}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => setSelected(isSelected ? null : node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSelected(isSelected ? null : node.id);
        }
      }}
      className="pipeline-card pointer-events-auto"
      style={cssVars}
    >
      <span aria-hidden className="pipeline-card-gloss" />

      <span aria-hidden className="pipeline-port" data-side="in" />
      <span aria-hidden className="pipeline-port" data-side="out" />

      {/* Row 1 — halo orbital 3D + disque icône · kicker · LED */}
      <div className="pipeline-card-row pipeline-card-row-top">
        <span className="pipeline-icon-halo">
          <svg
            aria-hidden
            viewBox="-1.8 -1.8 3.6 3.6"
            className="pipeline-icon-orbit"
            preserveAspectRatio="xMidYMid meet"
          >
            <ellipse
              cx="0" cy="0" rx="1.4" ry="1.4"
              className="pipeline-icon-orbit-ring pipeline-icon-orbit-ring--1"
            />
            <ellipse
              cx="0" cy="0" rx="1.4" ry="0.45"
              className="pipeline-icon-orbit-ring pipeline-icon-orbit-ring--2"
            />
            <ellipse
              cx="0" cy="0" rx="0.45" ry="1.4"
              className="pipeline-icon-orbit-ring pipeline-icon-orbit-ring--3"
            />
          </svg>
          <span className="pipeline-icon-disc">
            <StageIcon kind={node.kind} className="pipeline-icon-glyph" />
          </span>
        </span>
        <span className="pipeline-kicker">{kicker}</span>
        <span aria-hidden className="pipeline-led" />
      </div>

      {/* Row 2 — label principal */}
      <div className="pipeline-card-row pipeline-card-row-label">
        <span className="pipeline-card-label">{node.label}</span>
      </div>

      {/* Row 3 — metric + pastille d'état */}
      <div className="pipeline-card-row pipeline-card-row-bottom">
        <span className="pipeline-card-metric">{metric ?? "—"}</span>
        {badge && <span className="pipeline-state-pill">{badge}</span>}
      </div>

      <span aria-hidden className="pipeline-progress-rail" />

      {node.toggleable && node.flagKey && (
        <span className="pipeline-toggle-mount">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

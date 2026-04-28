"use client";

import { useEffect, useState } from "react";
import { bezierPath, edgePorts, getNode, portAt, type CanvasEdge } from "./topology";
import { useCanvasStore, type NodeState } from "./store";

interface Props {
  edge: CanvasEdge;
}

const STROKE = {
  baseMin: 1.4,
  baseMax: 4,
  active: 2.8,
} as const;

const TRAIL_TTL_MS = 4000;

function isFailed(from: NodeState, to: NodeState): boolean {
  return from === "failed" || from === "blocked" || to === "failed" || to === "blocked";
}

function isActive(from: NodeState, to: NodeState): boolean {
  if (from === "active" || to === "active") return true;
  if (from === "success" && to !== "idle") return true;
  return false;
}

/**
 * Sankey-style stroke: thicker for edges that carry more runs. Falls back to
 * the minimum width when no usage data is available yet.
 */
function sankeyWidth(edgeId: string, usage: Record<string, number> | null, total: number): number {
  if (!usage || total === 0) return STROKE.baseMin;
  const count = usage[edgeId] ?? 0;
  const ratio = Math.min(count / total, 1);
  return STROKE.baseMin + (STROKE.baseMax - STROKE.baseMin) * ratio;
}

/**
 * Câble fibre-optique en 4 strokes empilés (halo · body · core · traffic).
 * Toute la matérialité (couleur de branche, glow, opacité, dasharray traffic)
 * vient des classes `.pipeline-cable-*` dans globals.css. Ce composant ne fait
 * que poser `data-branch`, `data-active`, `data-failed` et calculer la
 * géométrie / l'épaisseur Sankey.
 */
export default function FlowEdge({ edge }: Props) {
  const fromState = useCanvasStore((s) => s.nodeStates[edge.from]);
  const toState = useCanvasStore((s) => s.nodeStates[edge.to]);
  const edgeUsage = useCanvasStore((s) => s.edgeUsage);
  const edgeUsageTotal = useCanvasStore((s) => s.edgeUsageTotal);
  const trailEntries = useCanvasStore((s) => s.runTrail);

  const [trailNow, setTrailNow] = useState(() => Date.now());

  const fromNode = getNode(edge.from);
  const toNode = getNode(edge.to);
  const dirs = edge.ports ?? edgePorts(fromNode, toNode);
  const a = portAt(fromNode, dirs.out);
  const b = portAt(toNode, dirs.in);
  const d = bezierPath(a, dirs.out, b, dirs.in);

  const failed = isFailed(fromState, toState);
  const active = !failed && isActive(fromState, toState);
  const baseWidth = sankeyWidth(edge.id, edgeUsage, edgeUsageTotal);
  const cableWidth = active ? Math.max(STROKE.active, baseWidth) : baseWidth;
  const haloWidth = cableWidth * 3.5;
  const coreWidth = Math.max(cableWidth * 0.4, 0.6);

  // Most recent trail entry for this edge (drives the afterglow opacity).
  const lastTrailTs = trailEntries.reduce(
    (acc, t) => (t.edgeId === edge.id && t.ts > acc ? t.ts : acc),
    0,
  );

  useEffect(() => {
    if (lastTrailTs === 0) return;
    const id = window.setInterval(() => setTrailNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [lastTrailTs]);

  const trailAge = lastTrailTs > 0 ? trailNow - lastTrailTs : Infinity;
  const trailOpacity = trailAge < TRAIL_TTL_MS ? 0.6 * (1 - trailAge / TRAIL_TTL_MS) : 0;

  return (
    <g
      className="pipeline-cable"
      data-branch={edge.branch ?? "pipeline"}
      data-active={active ? "true" : undefined}
      data-failed={failed ? "true" : undefined}
    >
      <path
        id={edge.id}
        d={d}
        className="pipeline-cable-halo"
        strokeWidth={haloWidth}
      />
      <path d={d} className="pipeline-cable-body" strokeWidth={cableWidth} />
      {!failed && (
        <path d={d} className="pipeline-cable-core" strokeWidth={coreWidth} />
      )}
      {active && (
        <path d={d} className="pipeline-cable-traffic" strokeWidth={cableWidth * 0.55}>
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-32"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {trailOpacity > 0 && (
        <path
          d={d}
          className="pipeline-cable-trail"
          strokeWidth={baseWidth + 1.5}
          opacity={trailOpacity}
        />
      )}

      {/* Connector dots — alignés avec .pipeline-port HTML (centre exact bord). */}
      <circle cx={a.x} cy={a.y} r={5} className="pipeline-cable-port-outer" />
      <circle cx={a.x} cy={a.y} r={2} className="pipeline-cable-port-inner" />
      <circle cx={b.x} cy={b.y} r={5} className="pipeline-cable-port-outer" />
      <circle cx={b.x} cy={b.y} r={2} className="pipeline-cable-port-inner" />
    </g>
  );
}

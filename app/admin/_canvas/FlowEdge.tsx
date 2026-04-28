"use client";

import { bezierPath, edgePorts, getNode, portAt, type CanvasEdge } from "./topology";
import { useCanvasStore, type NodeState } from "./store";

interface Props {
  edge: CanvasEdge;
}

const STROKE = {
  baseMin: 1.2,
  baseMax: 3.6,
  active: 2.4,
  ambient: 1,
  traffic: 1.8,
  failed: 1.6,
} as const;

const DASH = {
  base: "4 6",
  ambient: "4 12",
  traffic: "6 10",
  trail: "0",
} as const;

const BRANCH_COLOR: Record<NonNullable<CanvasEdge["branch"]>, string> = {
  pipeline: "var(--cykan)",
  research: "#A78BFA",
  agent: "#FBBF24",
  retrieval: "var(--cykan)",
};

const TRAIL_TTL_MS = 4000;

function edgeColor(edge: CanvasEdge): string {
  return edge.branch ? BRANCH_COLOR[edge.branch] : "var(--cykan)";
}

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
 * Layers per edge:
 *   1. Base — branch-colored dashed line, width ∝ run frequency (Sankey).
 *   2. Ambient — slow flow on idle so the canvas breathes.
 *   3. Active overlay — bright traffic on running edges.
 *   4. Trail — fades over 4s after a packet traversal (run replay / live).
 */
export default function FlowEdge({ edge }: Props) {
  const fromState = useCanvasStore((s) => s.nodeStates[edge.from]);
  const toState = useCanvasStore((s) => s.nodeStates[edge.to]);
  const edgeUsage = useCanvasStore((s) => s.edgeUsage);
  const edgeUsageTotal = useCanvasStore((s) => s.edgeUsageTotal);
  const trailEntries = useCanvasStore((s) => s.runTrail);

  const fromNode = getNode(edge.from);
  const toNode = getNode(edge.to);
  const dirs = edgePorts(fromNode, toNode);
  const a = portAt(fromNode, dirs.out);
  const b = portAt(toNode, dirs.in);
  const d = bezierPath(a, dirs.out, b, dirs.in);

  const failed = isFailed(fromState, toState);
  const active = !failed && isActive(fromState, toState);
  const color = edgeColor(edge);
  const baseWidth = sankeyWidth(edge.id, edgeUsage, edgeUsageTotal);

  // Most recent trail entry for this edge (drives the afterglow opacity).
  const lastTrailTs = trailEntries.reduce(
    (acc, t) => (t.edgeId === edge.id && t.ts > acc ? t.ts : acc),
    0,
  );
  const trailAge = lastTrailTs > 0 ? Date.now() - lastTrailTs : Infinity;
  const trailOpacity = trailAge < TRAIL_TTL_MS ? 0.6 * (1 - trailAge / TRAIL_TTL_MS) : 0;

  if (failed) {
    return (
      <g>
        <path
          id={edge.id}
          d={d}
          stroke="var(--danger)"
          strokeWidth={STROKE.failed}
          fill="none"
          opacity={0.7}
        />
      </g>
    );
  }

  return (
    <g>
      {/* Base path — branch-tinted, Sankey-thick on the trunk. */}
      <path
        id={edge.id}
        d={d}
        stroke={color}
        strokeWidth={active ? Math.max(STROKE.active, baseWidth) : baseWidth}
        fill="none"
        opacity={active ? 0.95 : 0.32}
        strokeDasharray={DASH.base}
        strokeLinecap="round"
        style={{
          transition:
            "opacity 220ms var(--ease-standard), stroke-width 220ms var(--ease-standard)",
          filter: active ? `drop-shadow(0 0 12px ${color})` : "none",
        }}
      />

      {/* Ambient flow — subtle movement when idle so the canvas breathes. */}
      {!active && (
        <path
          d={d}
          stroke={color}
          strokeWidth={STROKE.ambient}
          strokeDasharray={DASH.ambient}
          strokeLinecap="round"
          fill="none"
          opacity={0.5}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-32"
            dur="4s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Active traffic — bright overlay tracking flowing packets. */}
      {active && (
        <path
          d={d}
          stroke="var(--foreground)"
          strokeWidth={STROKE.traffic}
          strokeDasharray={DASH.traffic}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-32"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Run trail afterglow — solid stroke that fades over TRAIL_TTL_MS. */}
      {trailOpacity > 0 && (
        <path
          d={d}
          stroke={color}
          strokeWidth={baseWidth + 1}
          fill="none"
          opacity={trailOpacity}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      )}
    </g>
  );
}

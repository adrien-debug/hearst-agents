"use client";

import { bezierPath, edgePorts, getNode, portAt, type CanvasEdge } from "./topology";
import { useCanvasStore, type NodeState } from "./store";

interface Props {
  edge: CanvasEdge;
}

const STROKE = {
  baseMin: 1.2,
  baseMax: 3.6,
  active: 2.6,
  ambient: 1,
  traffic: 1.8,
  failed: 1.6,
} as const;

const DASH = {
  base: "4 6",
  ambient: "4 12",
  traffic: "6 10",
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
 * Fiber-optic cable composite — three stacked strokes give the edge its
 * material feel:
 *   1. Halo (×3 width, blurred) — the "glow" around the cable.
 *   2. Cable (sankey width, branch color) — the body of the cable.
 *   3. Core (×0.5 width, near-white) — the bright fiber core inside.
 * Plus connector dots at both endpoints where the cable plugs into the
 * source / target nodes.
 *
 * Failed edges replace the cyan with --danger and drop the ambient + traffic
 * decoration to keep the failure unambiguous.
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
  const cableWidth = active ? Math.max(STROKE.active, baseWidth) : baseWidth;
  const haloWidth = cableWidth * 3 + 1;
  const coreWidth = Math.max(cableWidth * 0.45, 0.6);

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
          strokeWidth={STROKE.failed * 3}
          fill="none"
          opacity={0.18}
          style={{ filter: "blur(3px)" }}
        />
        <path
          d={d}
          stroke="var(--danger)"
          strokeWidth={STROKE.failed}
          fill="none"
          opacity={0.85}
        />
        <circle cx={a.x} cy={a.y} r={3} fill="var(--danger)" />
        <circle cx={b.x} cy={b.y} r={3} fill="var(--danger)" />
      </g>
    );
  }

  return (
    <g>
      {/* Halo — soft cyan/branch glow that gives the cable its volume. */}
      <path
        d={d}
        stroke={color}
        strokeWidth={haloWidth}
        fill="none"
        opacity={active ? 0.25 : 0.12}
        strokeLinecap="round"
        style={{
          filter: "blur(3px)",
          transition: "opacity 220ms var(--ease-standard)",
        }}
      />

      {/* Cable body — branch-tinted, Sankey thickness, dashed for sci-fi feel. */}
      <path
        id={edge.id}
        d={d}
        stroke={color}
        strokeWidth={cableWidth}
        fill="none"
        opacity={active ? 0.95 : 0.55}
        strokeDasharray={DASH.base}
        strokeLinecap="round"
        style={{
          transition:
            "opacity 220ms var(--ease-standard), stroke-width 220ms var(--ease-standard)",
        }}
      />

      {/* Bright fiber core — ultra-thin near-white inner stroke. */}
      <path
        d={d}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={coreWidth}
        fill="none"
        opacity={active ? 0.7 : 0.25}
        strokeLinecap="round"
      />

      {/* Ambient flow — subtle dashed motion when idle. */}
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
          strokeWidth={baseWidth + 1.5}
          fill="none"
          opacity={trailOpacity}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      )}

      {/* Connector dots — where the cable plugs into the node ports. */}
      <circle cx={a.x} cy={a.y} r={3} fill={color} opacity={active ? 1 : 0.7} />
      <circle cx={a.x} cy={a.y} r={1.4} fill="rgba(255,255,255,0.85)" opacity={active ? 1 : 0.5} />
      <circle cx={b.x} cy={b.y} r={3} fill={color} opacity={active ? 1 : 0.7} />
      <circle cx={b.x} cy={b.y} r={1.4} fill="rgba(255,255,255,0.85)" opacity={active ? 1 : 0.5} />
    </g>
  );
}

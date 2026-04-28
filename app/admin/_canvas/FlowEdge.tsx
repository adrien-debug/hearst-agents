"use client";

import { bezierPath, getNode, ports, type CanvasEdge } from "./topology";
import { useCanvasStore, type NodeState } from "./store";

interface Props {
  edge: CanvasEdge;
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
 * Three layers per edge:
 *   1. Base — always visible cyan-tinted line at low opacity (idle baseline).
 *   2. Ambient — slow dashed flow at idle so the canvas feels alive even
 *      when nothing is happening.
 *   3. Active overlay — bright cyan with drop-shadow when traffic is on.
 *
 * Failed edges replace the cyan with --danger and drop the ambient layer.
 */
export default function FlowEdge({ edge }: Props) {
  const fromState = useCanvasStore((s) => s.nodeStates[edge.from]);
  const toState = useCanvasStore((s) => s.nodeStates[edge.to]);

  const fromNode = getNode(edge.from);
  const toNode = getNode(edge.to);
  const a = ports(fromNode).out;
  const b = ports(toNode).in;
  
  let d = bezierPath(a, b);

  // Custom routing for intent -> research to avoid crossing preflight & tools
  if (edge.from === "intent" && edge.to === "research") {
    const r = 16;
    // Exit intent from the right side instead of bottom
    const startX = fromNode.x + 110; // 220 / 2
    const startY = fromNode.y;
    // Enter research from top
    const endX = toNode.x;
    const endY = toNode.y - 32; // 64 / 2
    
    // Path: right -> down -> right -> down
    d = `M ${startX} ${startY} L ${endX - r} ${startY} Q ${endX} ${startY} ${endX} ${startY + r} L ${endX} ${endY}`;
  }

  const failed = isFailed(fromState, toState);
  const active = !failed && isActive(fromState, toState);

  if (failed) {
    return (
      <g>
        <path
          id={edge.id}
          d={d}
          stroke="var(--danger)"
          strokeWidth={1.6}
          fill="none"
          opacity={0.7}
        />
      </g>
    );
  }

  return (
    <g>
      {/* Base path — blueprint style dashed line */}
      <path
        id={edge.id}
        d={d}
        stroke="var(--cykan)"
        strokeWidth={active ? 2 : 1.2}
        fill="none"
        opacity={active ? 0.95 : 0.12}
        strokeDasharray="4 6"
        strokeLinecap="round"
        style={{
          transition:
            "opacity 220ms var(--ease-standard), stroke-width 220ms var(--ease-standard)",
          filter: active ? "drop-shadow(0 0 12px var(--cykan))" : "none",
        }}
      />

      {/* Ambient flow — subtle movement when idle */}
      {!active && (
        <path
          d={d}
          stroke="var(--cykan)"
          strokeWidth={1}
          strokeDasharray="4 12"
          strokeLinecap="round"
          fill="none"
          opacity={0.3}
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

      {/* Active traffic — trait brillant (Orbital : --foreground) */}
      {active && (
        <path
          d={d}
          stroke="var(--foreground)"
          strokeWidth={1.8}
          strokeDasharray="6 10"
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
    </g>
  );
}

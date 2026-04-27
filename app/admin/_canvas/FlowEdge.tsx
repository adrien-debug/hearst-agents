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
  const d = bezierPath(a, b);

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
      {/* Base path — also serves as the <mpath> target for FlowPacket animateMotion */}
      <path
        id={edge.id}
        d={d}
        stroke="var(--cykan)"
        strokeWidth={1.4}
        fill="none"
        opacity={active ? 0.95 : 0.22}
        style={{
          transition:
            "opacity 220ms var(--ease-standard), stroke-width 220ms var(--ease-standard)",
          filter: active ? "drop-shadow(0 0 6px var(--cykan))" : "none",
        }}
      />

      {/* Ambient flow — only when idle, gives the canvas pulse */}
      {!active && (
        <path
          d={d}
          stroke="var(--cykan)"
          strokeWidth={1.4}
          strokeDasharray="2 16"
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-18"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Active flow — fast bright dashes layered over the base */}
      {active && (
        <path
          d={d}
          stroke="#ffffff"
          strokeWidth={1.6}
          strokeDasharray="3 10"
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-13"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      )}
    </g>
  );
}

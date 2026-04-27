"use client";

import { useEffect } from "react";
import { EDGES, NODES, VIEWBOX } from "./topology";
import { useCanvasStore } from "./store";
import FlowNode from "./FlowNode";
import FlowEdge from "./FlowEdge";
import FlowPacket from "./FlowPacket";

/**
 * Flow canvas — fills available area, scales SVG and HTML nodes together
 * via percentage positioning. Background dot grid + cyan radial aura keep
 * the canvas alive even when idle.
 */
export default function FlowCanvas() {
  const packets = useCanvasStore((s) => s.packets);
  const cleanupPackets = useCanvasStore((s) => s.cleanupPackets);

  useEffect(() => {
    if (packets.length === 0) return;
    const t = setInterval(() => cleanupPackets(1500), 500);
    return () => clearInterval(t);
  }, [packets.length, cleanupPackets]);

  return (
    <div
      className="relative"
      style={{
        aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}`,
        width: "100%",
        maxHeight: "100%",
      }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="canvas-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.07)" />
          </pattern>
          <radialGradient id="canvas-aura" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(45, 212, 191, 0.10)" />
            <stop offset="60%" stopColor="rgba(45, 212, 191, 0.025)" />
            <stop offset="100%" stopColor="rgba(45, 212, 191, 0)" />
          </radialGradient>
          <radialGradient id="canvas-vignette" cx="50%" cy="50%" r="80%">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-dots)" />
        <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-aura)" />
        <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-vignette)" />

        <g>
          {EDGES.map((edge) => (
            <FlowEdge key={edge.id} edge={edge} />
          ))}
        </g>

        <g>
          {packets.map((p) => (
            <FlowPacket key={p.id} packet={p} />
          ))}
        </g>
      </svg>

      {/* Node layer — positioned in % so it follows the SVG scale */}
      <div className="absolute inset-0">
        {NODES.map((node) => (
          <FlowNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

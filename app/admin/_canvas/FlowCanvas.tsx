"use client";

import { useEffect } from "react";
import { EDGES, NODES, VIEWBOX } from "./topology";
import { useCanvasStore } from "./store";
import FlowNode from "./FlowNode";
import FlowEdge from "./FlowEdge";
import FlowPacket from "./FlowPacket";

/**
 * Flow canvas — variante « Orbital HUD ». Le wrapper fluide se cale sur le
 * ratio du viewBox pour fitter la zone disponible (`max-w-full max-h-full`)
 * sans scroll, tout en gardant la grille / vignette / halo cyan.
 */
export default function FlowCanvas() {
  const packets = useCanvasStore((s) => s.packets);
  const cleanupPackets = useCanvasStore((s) => s.cleanupPackets);
  const trailLength = useCanvasStore((s) => s.runTrail.length);
  const cleanupTrail = useCanvasStore((s) => s.cleanupTrail);

  useEffect(() => {
    if (packets.length === 0) return;
    const t = setInterval(() => cleanupPackets(1500), 500);
    return () => clearInterval(t);
  }, [packets.length, cleanupPackets]);

  // Trail tick — also forces FlowEdge re-render so the afterglow fades.
  useEffect(() => {
    if (trailLength === 0) return;
    const t = setInterval(() => cleanupTrail(4000), 500);
    return () => clearInterval(t);
  }, [trailLength, cleanupTrail]);

  return (
    <div className="absolute inset-0 grid place-items-center p-(--space-6) overflow-hidden">
      <div
        data-pipeline-visual="orbit"
        className="relative w-full max-w-full max-h-full rounded-(--radius-2xl) overflow-hidden shadow-(--shadow-lg) ring-1 ring-(--cykan)/20"
        style={{
          aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}`,
        }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grille : pas = --space-10 (40px) lignes + --space-5 (20px) points — valeurs numériques requises par SVG pattern */}
            <pattern id="canvas-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--line)" strokeWidth="1" />
            </pattern>
            <pattern id="canvas-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--line-strong)" />
            </pattern>

            {/* Halo système + vignette pour profondeur (Orbital HUD) */}
            <radialGradient id="canvas-aura" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="var(--cykan)" stopOpacity="0.14" />
              <stop offset="45%" stopColor="var(--cykan)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="canvas-vignette" cx="50%" cy="50%" r="88%">
              <stop offset="28%" stopColor="var(--pipeline-vignette-mid)" />
              <stop offset="100%" stopColor="var(--pipeline-vignette-edge)" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="var(--pipeline-base-fill)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-grid)" />
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
    </div>
  );
}

"use client";

import { useEffect } from "react";
import {
  EDGES,
  NODES,
  PIPELINE_DOT_STEP_PX,
  PIPELINE_GRID_STEP_PX,
  PIPELINE_SCANLINE_HEIGHT_PX,
  VIEWBOX,
} from "./topology";
import { useCanvasStore } from "./store";
import FlowNode from "./FlowNode";
import FlowEdge from "./FlowEdge";
import FlowPacket from "./FlowPacket";

/**
 * Flow canvas — variante « Orbital HUD » V4 : panneau holographique avec
 * perspective 3D assumée (--pipeline-tilt), vignette dense, scanline qui
 * parcourt le viewport, grille cyan + halo radial. Cards et câbles posés
 * au-dessus. Toute la matérialité vient de `.pipeline-canvas-frame` +
 * `[data-pipeline-visual="orbit"]` (globals.css). Aucun style inline.
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

  useEffect(() => {
    if (trailLength === 0) return;
    const t = setInterval(() => cleanupTrail(4000), 500);
    return () => clearInterval(t);
  }, [trailLength, cleanupTrail]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div data-pipeline-visual="orbit" className="pipeline-canvas-frame">
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grille : pas = --space-10 (40px) lignes + --space-5 (20px) points */}
            <pattern
              id="canvas-grid"
              x="0"
              y="0"
              width={PIPELINE_GRID_STEP_PX}
              height={PIPELINE_GRID_STEP_PX}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${PIPELINE_GRID_STEP_PX} 0 L 0 0 0 ${PIPELINE_GRID_STEP_PX}`}
                fill="none"
                stroke="var(--line)"
                strokeWidth="1"
              />
            </pattern>
            <pattern id="canvas-dots" x="0" y="0" width={PIPELINE_DOT_STEP_PX} height={PIPELINE_DOT_STEP_PX} patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--line-strong)" />
            </pattern>

            {/* Halo système + vignette pour profondeur (Orbital HUD) */}
            <radialGradient id="canvas-aura" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="var(--cykan)" stopOpacity="0.18" />
              <stop offset="45%" stopColor="var(--cykan)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="canvas-vignette" cx="50%" cy="50%" r="78%">
              <stop offset="20%" stopColor="var(--pipeline-vignette-mid)" />
              <stop offset="100%" stopColor="var(--pipeline-vignette-edge)" />
            </radialGradient>

            {/* Scanline — bande horizontale cyan qui descend en boucle. */}
            <linearGradient id="canvas-scanline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cykan)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--cykan)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--cykan)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="var(--pipeline-base-fill)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-grid)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-dots)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-aura)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-vignette)" />

          {/* Animated scanline — hauteur = `--space-24` (voir topology `PIPELINE_SCANLINE_HEIGHT_PX`). */}
          <rect
            x="0"
            y={-PIPELINE_SCANLINE_HEIGHT_PX}
            width={VIEWBOX.width}
            height={PIPELINE_SCANLINE_HEIGHT_PX}
            fill="url(#canvas-scanline)"
            pointerEvents="none"
            className="motion-reduce:hidden"
          >
            <animate
              attributeName="y"
              from={-PIPELINE_SCANLINE_HEIGHT_PX}
              to={VIEWBOX.height}
              dur="var(--duration-pipeline-scanline)"
              repeatCount="indefinite"
            />
          </rect>

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

        {/* Node layer — positioned in % so it follows the SVG scale. */}
        <div className="pipeline-node-layer pointer-events-none">
          {NODES.map((node) => (
            <FlowNode key={node.id} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}

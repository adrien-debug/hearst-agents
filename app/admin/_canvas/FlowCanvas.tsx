"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  EDGES,
  NODES,
  PIPELINE_DOT_STEP_PX,
  PIPELINE_GRID_STEP_PX,
  VIEWBOX,
} from "./topology";
import { useCanvasStore } from "./store";
import FlowNode from "./FlowNode";
import FlowEdge from "./FlowEdge";
import FlowPacket from "./FlowPacket";

/**
 * Flow canvas — surface technique (grille + dots) sur le thème courant
 * (light en admin). La couche cards est dimensionnée par ResizeObserver
 * pour matcher exactement la zone de rendu SVG (xMidYMid meet) à tout
 * viewport, sinon les ports cards/câbles se désalignent.
 */
export default function FlowCanvas() {
  const packets = useCanvasStore((s) => s.packets);
  const cleanupPackets = useCanvasStore((s) => s.cleanupPackets);
  const trailLength = useCanvasStore((s) => s.runTrail.length);
  const cleanupTrail = useCanvasStore((s) => s.cleanupTrail);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [layerSize, setLayerSize] = useState<{ w: number; h: number } | null>(null);

  // Match the SVG xMidYMid meet content area: largest 1920×1080 rect that
  // fits inside the frame, centered.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ratio = VIEWBOX.width / VIEWBOX.height;
    const update = () => {
      const { width, height } = frame.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const containerRatio = width / height;
      const w = containerRatio > ratio ? height * ratio : width;
      const h = containerRatio > ratio ? height : width / ratio;
      setLayerSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

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

  const layerStyle: CSSProperties & Record<string, string> = layerSize
    ? {
        "--pl-layer-w": `${layerSize.w}px`,
        "--pl-layer-h": `${layerSize.h}px`,
      }
    : {};

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={frameRef} className="pipeline-canvas-frame">
        <svg
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grille technique : pas = --space-10 (40px) lignes + --space-5 (20px) points */}
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
          </defs>

          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-grid)" />
          <rect x="0" y="0" width={VIEWBOX.width} height={VIEWBOX.height} fill="url(#canvas-dots)" />

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

        {/* Couche cards — dimensions exactes de la zone meet du SVG. */}
        <div className="pipeline-node-layer pointer-events-none" style={layerStyle}>
          {NODES.map((node) => (
            <FlowNode key={node.id} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}

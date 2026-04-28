"use client";

import type { CanvasNode } from "./topology";
import { KIND_COLOR, NODE_SIZE, VIEWBOX } from "./topology";
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

const NODE_RADIUS = 18; // matches --radius-lg-ish for 220×104, large enough to feel like a "fiche"

/** Perimeter of a rounded rectangle: 2(w+h) - 8r + 2πr. */
const NODE_PERIMETER =
  2 * (NODE_SIZE.w + NODE_SIZE.h) - 8 * NODE_RADIUS + 2 * Math.PI * NODE_RADIUS;

function bgClass(state: NodeState): string {
  switch (state) {
    case "idle":
      return "bg-(--surface)/40";
    case "active":
      return "bg-linear-to-b from-(--surface) to-(--cykan-bg-active)";
    case "success":
      return "bg-(--surface)/60";
    case "failed":
      return "bg-linear-to-b from-(--surface) to-[color-mix(in_srgb,var(--danger)_12%,var(--surface))]";
    case "blocked":
      return "bg-linear-to-b from-(--surface) to-[color-mix(in_srgb,var(--warn)_14%,var(--surface))]";
    case "disabled":
      return "bg-transparent";
  }
}

export default function FlowNode({ node, metric }: Props) {
  const state = useCanvasStore((s) => s.nodeStates[node.id]);
  const setSelected = useCanvasStore((s) => s.setSelectedNodeId);
  const isSelected = useCanvasStore((s) => s.selectedNodeId === node.id);

  // Position + size in % of viewBox so the node layer scales with the canvas.
  const leftPct = (node.x / VIEWBOX.width) * 100;
  const topPct = (node.y / VIEWBOX.height) * 100;
  const widthPct = (NODE_SIZE.w / VIEWBOX.width) * 100;
  const heightPct = (NODE_SIZE.h / VIEWBOX.height) * 100;

  const badge = STATE_BADGE[state];
  const dashOffset =
    state === "idle"
      ? NODE_PERIMETER
      : state === "active"
        ? NODE_PERIMETER * 0.2
        : 0;

  const accentColor = KIND_COLOR[node.kind];
  const strokeColor =
    state === "failed"
      ? "var(--danger)"
      : state === "blocked"
        ? "var(--warn)"
        : accentColor;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setSelected(isSelected ? null : node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setSelected(isSelected ? null : node.id);
        }
      }}
      className={[
        "pipeline-node absolute rounded-(--radius-lg) backdrop-blur-md text-text",
        "transition-all duration-(--duration-base) ease-(--ease-standard)",
        "cursor-pointer outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--cykan)/60",
        bgClass(state),
        state === "active" ? "shadow-(--glow-cyan-md)" : "shadow-(--shadow-sm)",
        state === "disabled" ? "text-text-faint opacity-40" : "",
        isSelected ? "ring-1 ring-(--cykan)/60" : "",
      ].join(" ")}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Gauge border — viewBox-scoped so the dasharray stays consistent at any rendered size. */}
      <svg
        viewBox={`0 0 ${NODE_SIZE.w} ${NODE_SIZE.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none rounded-(--radius-lg)"
        style={{ overflow: "visible" }}
      >
        <rect
          x="0.5"
          y="0.5"
          width={NODE_SIZE.w - 1}
          height={NODE_SIZE.h - 1}
          rx={NODE_RADIUS}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="1"
        />
        <rect
          x="0.5"
          y="0.5"
          width={NODE_SIZE.w - 1}
          height={NODE_SIZE.h - 1}
          rx={NODE_RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={state === "idle" ? 0 : 2}
          strokeDasharray={NODE_PERIMETER}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: state !== "idle" ? `drop-shadow(0 0 8px ${strokeColor})` : "none",
          }}
        />
      </svg>

      {/* Header row — icon + label/sublabel. Padding tokens, no flex contention with the badge. */}
      <div className="absolute top-(--space-3) left-(--space-3) right-(--space-3) flex items-start gap-(--space-2) z-10 min-w-0">
        <span
          className="shrink-0 size-(--space-5) flex items-center justify-center"
          style={{ color: state === "idle" ? "var(--text-faint)" : strokeColor }}
        >
          <StageIcon kind={node.kind} />
        </span>
        <div className="flex flex-col gap-(--space-1) min-w-0 flex-1">
          <span className="t-13 font-medium leading-tight tracking-tight text-text truncate">
            {node.label}
          </span>
          <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-text-faint leading-none truncate">
            {node.sublabel}
          </span>
        </div>
      </div>

      {/* Footer strip — micro metric on the left, badge overlay on the right. */}
      <div className="absolute bottom-(--space-3) left-(--space-3) right-(--space-3) flex items-center justify-between gap-(--space-2) z-10 min-w-0">
        <span className="t-9 font-mono tracking-(--tracking-caption) text-text-faint truncate">
          {metric ?? "—"}
        </span>
        {badge && (
          <span
            className="shrink-0 t-9 font-mono uppercase tracking-(--tracking-label) px-(--space-2) py-(--space-1) rounded-(--radius-pill) border whitespace-nowrap backdrop-blur-md"
            style={{
              background: `color-mix(in srgb, ${strokeColor} 18%, transparent)`,
              borderColor: `color-mix(in srgb, ${strokeColor} 35%, transparent)`,
              color: strokeColor,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {node.toggleable && node.flagKey && (
        <span className="absolute -bottom-(--space-3) left-(--space-3) z-20">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

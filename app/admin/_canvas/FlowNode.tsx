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

const NODE_RADIUS = 18;
const NODE_PERIMETER =
  2 * (NODE_SIZE.w + NODE_SIZE.h) - 8 * NODE_RADIUS + 2 * Math.PI * NODE_RADIUS;

function bgClass(state: NodeState): string {
  switch (state) {
    case "idle":
      return "bg-(--surface)/70";
    case "active":
      return "bg-linear-to-b from-(--surface) to-(--cykan-bg-active)";
    case "success":
      return "bg-(--surface)/80";
    case "failed":
      return "bg-linear-to-b from-(--surface) to-[color-mix(in_srgb,var(--danger)_14%,var(--surface))]";
    case "blocked":
      return "bg-linear-to-b from-(--surface) to-[color-mix(in_srgb,var(--warn)_16%,var(--surface))]";
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

  const ledActive = state === "active";
  const ledColor =
    state === "failed"
      ? "var(--danger)"
      : state === "blocked"
        ? "var(--warn)"
        : state === "success"
          ? "var(--cykan)"
          : ledActive
            ? "var(--cykan)"
            : "var(--text-ghost)";

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
        "pipeline-node group absolute rounded-(--radius-lg) backdrop-blur-md text-text",
        "transition-all duration-(--duration-base) ease-(--ease-standard)",
        "cursor-pointer outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--cykan)/60",
        "hover:-translate-y-px hover:shadow-(--shadow-card-hover)",
        bgClass(state),
        state === "active"
          ? "shadow-(--shadow-card-hover)"
          : "shadow-(--shadow-card)",
        state === "disabled" ? "text-text-faint opacity-40" : "",
        isSelected ? "ring-1 ring-(--cykan)/60" : "",
      ].join(" ")}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: "translate(-50%, -50%)",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Top gloss highlight — 1px gradient line that fakes light hitting the
          card from above. Reinforces the "panel lifted off the canvas" feel. */}
      <span
        aria-hidden
        className="absolute inset-x-(--space-3) top-0 h-px rounded-full pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
        }}
      />

      {/* Connector ports — small filled dots on the left + right edges where
          incoming / outgoing cables plug in. Tinted by the stage's accent so
          you can read the branch family at a glance. */}
      <span
        aria-hidden
        className="absolute -left-(--space-1) top-1/2 -translate-y-1/2 size-(--space-2) rounded-(--radius-pill) z-20"
        style={{
          background: accentColor,
          boxShadow: `0 0 6px ${accentColor}, inset 0 0 0 2px var(--bg)`,
        }}
      />
      <span
        aria-hidden
        className="absolute -right-(--space-1) top-1/2 -translate-y-1/2 size-(--space-2) rounded-(--radius-pill) z-20"
        style={{
          background: accentColor,
          boxShadow: `0 0 6px ${accentColor}, inset 0 0 0 2px var(--bg)`,
        }}
      />

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
          rx={NODE_RADIUS - 0.5}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="1"
        />
        <rect
          x="0.5"
          y="0.5"
          width={NODE_SIZE.w - 1}
          height={NODE_SIZE.h - 1}
          rx={NODE_RADIUS - 0.5}
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

      {/* Top row — icon disc on the left, LED status dot on the right. */}
      <div className="absolute top-(--space-3) left-(--space-3) right-(--space-3) flex items-center justify-between z-10">
        <span
          className="size-(--space-8) rounded-(--radius-pill) flex items-center justify-center backdrop-blur-md"
          style={{
            background: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 40%, transparent)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.4)`,
            color: state === "idle" ? `color-mix(in srgb, ${accentColor} 70%, transparent)` : accentColor,
          }}
        >
          <StageIcon kind={node.kind} className="size-(--space-4)" />
        </span>
        <span
          className={`size-(--space-2) rounded-(--radius-pill) shrink-0 ${ledActive ? "animate-pulse" : ""}`}
          style={{
            background: ledColor,
            boxShadow: state !== "idle" ? `0 0 8px ${ledColor}` : "none",
          }}
        />
      </div>

      {/* Middle — label + sublabel, full card width so long names breathe. */}
      <div className="absolute left-(--space-3) right-(--space-3) flex flex-col gap-(--space-1) z-10 min-w-0" style={{ top: "44%" }}>
        <span className="t-13 font-medium leading-tight tracking-tight text-text truncate">
          {node.label}
        </span>
        <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-text-faint leading-none truncate">
          {node.sublabel}
        </span>
      </div>

      {/* Bottom strip — micro metric on the left, state badge as overlay pill on the right. */}
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
        <span className="absolute -bottom-(--space-3) right-(--space-3) z-20">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

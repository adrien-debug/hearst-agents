"use client";

import type { CanvasNode } from "./topology";
import { NODE_SIZE, VIEWBOX } from "./topology";
import { useCanvasStore, type NodeState } from "./store";
import NodeToggle from "./NodeToggle";

interface Props {
  node: CanvasNode;
}

const STATE_CLASSES: Record<NodeState, string> = {
  idle: [
    "bg-[var(--surface)]/40 backdrop-blur-2xl",
    "text-text-muted",
    "shadow-[var(--shadow-sm)]",
  ].join(" "),
  active: [
    "bg-linear-to-b from-[var(--surface)] to-[var(--cykan-bg-active)] backdrop-blur-2xl",
    "text-text",
    "shadow-[var(--glow-cyan-md)]",
  ].join(" "),
  success: [
    "bg-[var(--surface)]/60 backdrop-blur-2xl",
    "text-(--cykan)",
  ].join(" "),
  failed: [
    "bg-linear-to-b from-[var(--surface)] to-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] backdrop-blur-2xl",
    "text-danger",
  ].join(" "),
  blocked: [
    "bg-linear-to-b from-[var(--surface)] to-[color-mix(in_srgb,var(--warn)_14%,var(--surface))] backdrop-blur-2xl",
    "text-warn",
  ].join(" "),
  disabled: [
    "bg-transparent",
    "text-text-faint opacity-40",
  ].join(" "),
};

const STATE_BADGE: Partial<Record<NodeState, string>> = {
  active: "actif",
  success: "ok",
  failed: "fail",
  blocked: "bloqué",
};

export default function FlowNode({ node }: Props) {
  const state = useCanvasStore((s) => s.nodeStates[node.id]);
  const setSelected = useCanvasStore((s) => s.setSelectedNodeId);
  const isSelected = useCanvasStore((s) => s.selectedNodeId === node.id);

  // Position-as-percentage so the node layer scales with the SVG viewBox.
  const leftPct = (node.x / VIEWBOX.width) * 100;
  const topPct = (node.y / VIEWBOX.height) * 100;

  const badge = STATE_BADGE[state];
  const perimeter = 514; // Approx perimeter of 220x64 pill shape (rx=32)
  const dashOffset =
    state === "idle"
      ? perimeter
      : state === "active"
        ? perimeter * 0.2 // 80% full when active
        : 0; // 100% full when success/failed/blocked

  const strokeColor =
    state === "failed"
      ? "var(--danger)"
      : state === "blocked"
        ? "var(--warn)"
        : "var(--cykan)";

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
        "pipeline-node absolute flex items-center justify-between rounded-full px-(--space-5) py-(--space-2)",
        "transition-all duration-(--duration-base) ease-(--ease-standard)",
        "cursor-pointer outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--cykan)/60",
        STATE_CLASSES[state],
        isSelected ? "ring-1 ring-(--cykan)/60 bg-(--cykan-surface)" : "",
      ].join(" ")}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: NODE_SIZE.w,
        height: NODE_SIZE.h,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* SVG Gauge Border */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none rounded-full" style={{ overflow: "visible" }}>
        {/* Base Track */}
        <rect
          x="0.5"
          y="0.5"
          width="calc(100% - 1px)"
          height="calc(100% - 1px)"
          rx="31.5"
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="1"
        />
        {/* Animated Gauge */}
        <rect
          x="0.5"
          y="0.5"
          width="calc(100% - 1px)"
          height="calc(100% - 1px)"
          rx="31.5"
          fill="none"
          stroke={strokeColor}
          strokeWidth={state === "idle" ? "0" : "2"}
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: state !== "idle" ? `drop-shadow(0 0 8px ${strokeColor})` : "none",
          }}
        />
      </svg>

      <div className="flex flex-col items-start justify-center gap-[2px] relative z-10">
        <span className="t-13 font-medium leading-none tracking-tight text-text">{node.label}</span>
        <span className="t-9 font-mono uppercase tracking-widest text-text-faint leading-none">{node.sublabel}</span>
      </div>

      {badge && (
        <span
          className="relative z-10 t-10 font-mono uppercase tracking-widest px-[8px] py-[4px] rounded-full border whitespace-nowrap"
          style={{
            background: `color-mix(in srgb, ${strokeColor} 15%, transparent)`,
            borderColor: `color-mix(in srgb, ${strokeColor} 30%, transparent)`,
            color: strokeColor,
          }}
        >
          {badge}
        </span>
      )}

      {node.toggleable && node.flagKey && (
        <span className="absolute -bottom-(--space-4) left-1/2 -translate-x-1/2 z-10">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

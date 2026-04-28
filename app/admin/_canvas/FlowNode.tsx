"use client";

import type { CanvasNode } from "./topology";
import { NODE_SIZE } from "./topology";
import { useCanvasStore, type NodeState } from "./store";
import NodeToggle from "./NodeToggle";

interface Props {
  node: CanvasNode;
}

const STATE_CLASSES: Record<NodeState, string> = {
  idle: [
    "border border-white/5",
    "bg-[#030303]/80 backdrop-blur-md",
    "text-text-muted",
    "shadow-sm",
  ].join(" "),
  active: [
    "border border-(--cykan)/40",
    "bg-gradient-to-r from-[#030303]/90 to-(--cykan)/10 backdrop-blur-md",
    "text-text",
    "shadow-[0_0_20px_rgba(45,212,191,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
  ].join(" "),
  success: [
    "border border-(--cykan)/20",
    "bg-[#030303]/80 backdrop-blur-md",
    "text-text-soft",
  ].join(" "),
  failed: [
    "border border-(--danger)/30",
    "bg-gradient-to-r from-[#030303]/90 to-(--danger)/10 backdrop-blur-md",
    "text-danger",
  ].join(" "),
  blocked: [
    "border border-(--warn)/30",
    "bg-gradient-to-r from-[#030303]/90 to-(--warn)/10 backdrop-blur-md",
    "text-warn",
  ].join(" "),
  disabled: [
    "border border-transparent",
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
  const leftPct = (node.x / 1500) * 100;
  const topPct = (node.y / 600) * 100;

  const badge = STATE_BADGE[state];

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
        "absolute flex items-center justify-between rounded-(--radius-lg) px-(--space-4) py-(--space-2)",
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
      <div className="flex flex-col items-start justify-center gap-1">
        <span className="t-13 font-medium leading-none tracking-tight">{node.label}</span>
        <span className="t-9 font-mono uppercase tracking-[0.14em] text-text-faint leading-none">{node.sublabel}</span>
      </div>

      {badge && (
        <span
          className="t-10 font-mono uppercase tracking-widest px-[6px] py-[2px] rounded-sm border whitespace-nowrap"
          style={{
            background:
              state === "failed"
                ? "color-mix(in srgb, var(--danger) 15%, transparent)"
                : state === "blocked"
                  ? "color-mix(in srgb, var(--warn) 15%, transparent)"
                  : "color-mix(in srgb, var(--cykan) 15%, transparent)",
            borderColor:
              state === "failed"
                ? "color-mix(in srgb, var(--danger) 30%, transparent)"
                : state === "blocked"
                  ? "color-mix(in srgb, var(--warn) 30%, transparent)"
                  : "color-mix(in srgb, var(--cykan) 30%, transparent)",
            color:
              state === "failed"
                ? "var(--danger)"
                : state === "blocked"
                  ? "var(--warn)"
                  : "var(--cykan)",
          }}
        >
          {badge}
        </span>
      )}

      {node.toggleable && node.flagKey && (
        <span className="absolute -bottom-(--space-3) left-1/2 -translate-x-1/2">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

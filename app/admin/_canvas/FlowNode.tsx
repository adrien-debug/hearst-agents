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
    "border border-white/[0.08]",
    "bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-transparent",
    "text-[var(--text-soft)]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
  ].join(" "),
  active: [
    "border border-[var(--cykan)]/70",
    "bg-gradient-to-b from-[var(--cykan)]/15 via-[var(--cykan)]/8 to-[var(--cykan)]/4",
    "text-[var(--text)]",
    "shadow-[var(--glow-cyan-md),inset_0_1px_0_rgba(255,255,255,0.08)]",
    "scale-[1.04]",
  ].join(" "),
  success: [
    "border border-[var(--cykan)]/45",
    "bg-gradient-to-b from-[var(--cykan)]/10 via-[var(--cykan)]/5 to-transparent",
    "text-[var(--cykan)]",
    "shadow-[var(--glow-cyan-sm),inset_0_1px_0_rgba(255,255,255,0.04)]",
  ].join(" "),
  failed: [
    "border border-[var(--danger)]/55",
    "bg-gradient-to-b from-[var(--danger)]/15 via-[var(--danger)]/8 to-transparent",
    "text-[var(--danger)]",
    "shadow-[0_0_30px_rgba(255,51,51,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]",
  ].join(" "),
  blocked: [
    "border border-[var(--warn)]/55",
    "bg-gradient-to-b from-[var(--warn)]/15 via-[var(--warn)]/8 to-transparent",
    "text-[var(--warn)]",
    "shadow-[0_0_30px_rgba(255,204,0,0.15),inset_0_1px_0_rgba(255,255,255,0.04)]",
  ].join(" "),
  disabled: [
    "border border-white/[0.05]",
    "bg-[var(--bg-soft)]",
    "text-[var(--text-faint)] opacity-50",
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
        "absolute flex flex-col items-center justify-center rounded-lg px-3",
        "transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)]",
        "text-center cursor-pointer outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--cykan)]/60",
        STATE_CLASSES[state],
        isSelected ? "ring-1 ring-[var(--cykan)]/60" : "",
      ].join(" ")}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: NODE_SIZE.w,
        height: NODE_SIZE.h,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span className="t-13 font-medium leading-tight">{node.label}</span>
      <span className="t-9 font-mono uppercase tracking-[0.14em] mt-1.5 opacity-60 leading-none">
        {node.sublabel}
      </span>

      {badge && (
        <span
          className="absolute -top-2 -right-2 t-9 font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm border whitespace-nowrap"
          style={{
            background:
              state === "failed"
                ? "color-mix(in srgb, var(--danger) 22%, transparent)"
                : state === "blocked"
                  ? "color-mix(in srgb, var(--warn) 22%, transparent)"
                  : "color-mix(in srgb, var(--cykan) 22%, transparent)",
            borderColor:
              state === "failed"
                ? "color-mix(in srgb, var(--danger) 50%, transparent)"
                : state === "blocked"
                  ? "color-mix(in srgb, var(--warn) 50%, transparent)"
                  : "color-mix(in srgb, var(--cykan) 50%, transparent)",
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
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2">
          <NodeToggle flagKey={node.flagKey} />
        </span>
      )}
    </div>
  );
}

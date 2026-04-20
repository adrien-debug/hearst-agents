"use client";

import { memo, useMemo } from "react";
import { useHalo, getCachedProviderUi } from "@/app/hooks/use-halo";
import type {
  HaloCoreState,
  HaloProviderNode,
  HaloArtifactSignal,
  HaloFlowLabel,
} from "@/app/lib/halo-state";

// ── Core visual mapping ─────────────────────────────────────

const CORE_VISUALS: Record<HaloCoreState, { color: string; glow: string; anim: string }> = {
  idle: {
    color: "bg-white/15",
    glow: "bg-white/3",
    anim: "animate-[pulse_4s_ease-in-out_infinite]",
  },
  thinking: {
    color: "bg-cyan-400/80",
    glow: "bg-cyan-400/10",
    anim: "animate-pulse",
  },
  executing: {
    color: "bg-cyan-400",
    glow: "bg-cyan-400/15",
    anim: "",
  },
  waiting_approval: {
    color: "bg-amber-400/80",
    glow: "bg-amber-400/10",
    anim: "animate-pulse",
  },
  degraded: {
    color: "bg-amber-400/60",
    glow: "bg-amber-400/8",
    anim: "",
  },
  success: {
    color: "bg-emerald-400/80",
    glow: "bg-emerald-400/10",
    anim: "",
  },
};

// ── Provider Node ───────────────────────────────────────────

const ProviderNode = memo(function ProviderNode({
  node,
  isBg,
}: {
  node: HaloProviderNode;
  isBg: boolean;
}) {
  const ui = getCachedProviderUi(node.providerId);
  const isActive = node.status === "active";
  const isFading = node.status === "fading";

  return (
    <div
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/4 text-[9px] transition-all duration-700 ${
        isActive && !isBg
          ? "scale-[1.06] opacity-100 ring-1 ring-cyan-400/15 shadow-[0_0_4px_rgba(34,211,238,0.08)]"
          : isActive && isBg
            ? "opacity-60"
            : isFading
              ? "opacity-40"
              : "opacity-30"
      }`}
    >
      <span
        className={`font-semibold leading-none transition-colors duration-500 ${
          isActive ? (isBg ? "text-cyan-400/50" : "text-cyan-400/80") : "text-white/40"
        }`}
      >
        {ui.initial}
      </span>
      {isActive && !isBg && (
        <div className="absolute inset-0 rounded-full border border-cyan-400/10 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
      )}
    </div>
  );
});

// ── Flow label ──────────────────────────────────────────────

const FlowLabel = memo(function FlowLabel({
  label,
  isBg,
}: {
  label: HaloFlowLabel;
  isBg: boolean;
}) {
  if (!label) return <div className="min-w-[80px]" />;

  return (
    <div className="min-w-[80px] flex items-center">
      <span
        className={`font-mono text-[8px] uppercase tracking-[0.15em] transition-all duration-500 animate-[fadeIn_300ms_ease-out] ${
          isBg ? "text-zinc-500/60" : "text-cyan-400/50"
        }`}
      >
        {label}
      </span>
    </div>
  );
});

// ── Artifact signal ─────────────────────────────────────────

const ArtifactSignal = memo(function ArtifactSignal({
  signal,
}: {
  signal: HaloArtifactSignal;
}) {
  const isEmerging = signal.status === "emerging";
  const isHandoff = signal.status === "handoff";
  const isSettled = signal.status === "settled";

  return (
    <div
      className={`flex items-center gap-1.5 transition-all duration-700 ${
        isEmerging
          ? "opacity-50"
          : isHandoff
            ? "opacity-90"
            : isSettled
              ? "opacity-40"
              : "opacity-0"
      }`}
    >
      <div
        className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
          isHandoff
            ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.2)]"
            : isEmerging
              ? "bg-cyan-400/40 animate-pulse"
              : "bg-emerald-400/30"
        }`}
      />
      {isHandoff && (
        <span className="font-mono text-[7px] text-emerald-400/50 uppercase tracking-wider">
          {signal.kind}
        </span>
      )}
    </div>
  );
});

// ── Main component ──────────────────────────────────────────

export function OrchestrationHalo() {
  const { state, motion } = useHalo();

  const core = useMemo(() => CORE_VISUALS[state.coreState], [state.coreState]);
  const isBg = state.intensity === "background";

  return (
    <div className="flex h-10 w-full items-center justify-center relative shrink-0">
      {/* Neural streak */}
      {motion.shouldShowNeuralStreak && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-linear-to-r from-transparent via-cyan-400/8 to-transparent transition-opacity duration-700" />
      )}

      <div className="flex items-center gap-5 rounded-full bg-white/2 px-5 py-2 backdrop-blur-xl">
        {/* System Core */}
        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full blur-sm transition-all duration-700 ${core.glow} ${
              motion.shouldPulseCore ? core.anim : ""
            } ${isBg ? "opacity-50" : ""}`}
          />
          <div
            className={`h-1.5 w-1.5 rounded-full transition-all duration-700 ${core.color} ${
              motion.shouldIgniteCore ? "scale-125" : ""
            } ${isBg ? "opacity-60" : ""}`}
          />
        </div>

        {/* Provider orbit — fixed 3-slot layout */}
        <div className="flex items-center gap-2.5 min-w-[84px]">
          {state.activeProviders.map((node) => (
            <ProviderNode key={node.providerId} node={node} isBg={isBg} />
          ))}
        </div>

        {/* Semantic flow label */}
        {motion.shouldShowFlowLabel && (
          <FlowLabel label={state.flowLabel} isBg={isBg} />
        )}

        {/* Artifact emergence */}
        {motion.shouldShowArtifactHandoff && state.emergingArtifact && (
          <ArtifactSignal signal={state.emergingArtifact} />
        )}
      </div>
    </div>
  );
}

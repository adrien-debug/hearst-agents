"use client";

import { memo, useMemo, useRef, useEffect } from "react";
import { getCachedProviderUi } from "@/app/hooks/use-halo";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import type {
  HaloCoreState,
  HaloProviderNode,
  HaloArtifactSignal,
  HaloFlowLabel,
  HaloState,
} from "@/app/lib/halo-state";

const CORE_VISUALS: Record<HaloCoreState, { color: string; border: string }> = {
  idle: { color: "bg-white/30", border: "border-white/20" },
  thinking: { color: "bg-cyan-accent/80 shadow-[0_0_8px_rgba(0,229,255,0.5)]", border: "border-cyan-accent/50" },
  executing: { color: "bg-cyan-accent shadow-[0_0_12px_rgba(0,229,255,0.8)]", border: "border-cyan-accent/60" },
  waiting_approval: { color: "bg-amber-400/80", border: "border-amber-500/60" },
  degraded: { color: "bg-amber-400/50", border: "border-amber-500/40" },
  success: { color: "bg-white/70", border: "border-white/30" },
};

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
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] transition-[opacity,background-color,border-color,transform] duration-500 ease-out ${
        isActive && !isBg
          ? "opacity-100 border-white/30"
          : isActive && isBg
            ? "opacity-60 border-white/20"
            : isFading
              ? "opacity-40 border-white/15"
              : "opacity-30 border-white/10"
      }`}
    >
      <span
        className={`font-semibold leading-none transition-colors duration-450 ease-out ${
          isActive ? "text-white/90" : "text-zinc-400"
        }`}
      >
        {ui.initial}
      </span>
    </div>
  );
});

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
        className={`font-mono text-[8px] uppercase tracking-[0.15em] transition-colors duration-450 ease-out ${
          isBg ? "text-zinc-500" : "text-zinc-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
});

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
      className={`flex items-center gap-1.5 transition-[opacity,background-color,border-color,transform] duration-500 ease-out ${
        isEmerging ? "opacity-50" : isHandoff ? "opacity-90" : isSettled ? "opacity-30" : "opacity-0"
      }`}
    >
      <div
        className={`h-1.5 w-1.5 rounded-full transition-[opacity,background-color,box-shadow] duration-450 ease-out ${
          isHandoff ? "bg-cyan-accent shadow-[0_0_6px_rgba(0,229,255,0.6)]" : isEmerging ? "bg-cyan-accent/50 animate-pulse" : "bg-white/30"
        }`}
      />
      {isHandoff && (
        <span className="font-mono text-[7px] text-cyan-accent/70 uppercase tracking-wider">
          {signal.kind}
        </span>
      )}
    </div>
  );
});

export function OrchestrationHalo({ restoredState }: { restoredState?: HaloState | null } = {}) {
  const { state, motion, restoreState } = useHaloRuntime();

  const lastRestoredRef = useRef<HaloState | null>(null);
  useEffect(() => {
    if (restoredState && restoredState !== lastRestoredRef.current) {
      lastRestoredRef.current = restoredState;
      restoreState(restoredState);
    }
  }, [restoredState, restoreState]);

  const core = useMemo(() => CORE_VISUALS[state.coreState], [state.coreState]);
  const isBg = state.intensity === "background";
  const isActive = state.coreState !== "idle" && state.coreState !== "success";

  return (
    <div className="flex h-10 w-full items-center justify-center relative shrink-0">
      <div className="flex items-center gap-5 px-5 py-2">
        {/* Core Signal — 56px, border only, no fill, no glow */}
        <div
          className="relative flex shrink-0 items-center justify-center"
          style={{ width: 56, height: 56 }}
        >
          <div
            className={`absolute inset-0 rounded-full border ${core.border} transition-[opacity,border-color,transform] duration-450 ease-out ${isBg ? "opacity-50" : ""}`}
            style={{
              background: "transparent",
              animation: isActive ? "halo-breathe 1.2s ease-in-out infinite" : "none",
            }}
          />
          <div
            className={`h-2 w-2 rounded-full transition-[opacity,background-color] duration-450 ease-out ${core.color} ${isBg ? "opacity-60" : ""}`}
          />
        </div>

        {/* Provider orbit */}
        <div className="flex items-center gap-2.5 min-w-[84px]">
          {state.activeProviders.map((node) => (
            <ProviderNode key={node.providerId} node={node} isBg={isBg} />
          ))}
        </div>

        {/* Flow label */}
        {motion.shouldShowFlowLabel && (
          <FlowLabel label={state.flowLabel} isBg={isBg} />
        )}

        {/* Artifact signal */}
        {motion.shouldShowArtifactHandoff && state.emergingArtifact && (
          <ArtifactSignal signal={state.emergingArtifact} />
        )}
      </div>
    </div>
  );
}

export const CoreSignal = OrchestrationHalo;

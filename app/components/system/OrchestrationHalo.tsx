"use client";

import { memo, useMemo, useRef, useEffect } from "react";
import { useHalo, getCachedProviderUi } from "@/app/hooks/use-halo";
import type {
  HaloCoreState,
  HaloProviderNode,
  HaloArtifactSignal,
  HaloFlowLabel,
  HaloState,
} from "@/app/lib/halo-state";

const CORE_VISUALS: Record<HaloCoreState, { color: string; border: string }> = {
  idle: { color: "bg-white/15", border: "border-white/[0.08]" },
  thinking: { color: "bg-white/40", border: "border-white/[0.25]" },
  executing: { color: "bg-white/60", border: "border-white/[0.25]" },
  waiting_approval: { color: "bg-amber-400/60", border: "border-amber-400/[0.15]" },
  degraded: { color: "bg-amber-400/40", border: "border-amber-400/[0.1]" },
  success: { color: "bg-white/50", border: "border-white/[0.2]" },
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
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.05] text-[9px] transition-all duration-700 ${
        isActive && !isBg
          ? "opacity-100 border-white/[0.15]"
          : isActive && isBg
            ? "opacity-50"
            : isFading
              ? "opacity-30"
              : "opacity-20"
      }`}
    >
      <span
        className={`font-semibold leading-none transition-colors duration-500 ${
          isActive ? "text-white/70" : "text-white/30"
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
        className={`font-mono text-[8px] uppercase tracking-[0.15em] transition-all duration-500 ${
          isBg ? "text-zinc-600" : "text-white/40"
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
      className={`flex items-center gap-1.5 transition-all duration-700 ${
        isEmerging ? "opacity-50" : isHandoff ? "opacity-90" : isSettled ? "opacity-30" : "opacity-0"
      }`}
    >
      <div
        className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
          isHandoff ? "bg-white/60" : isEmerging ? "bg-white/30 animate-pulse" : "bg-white/20"
        }`}
      />
      {isHandoff && (
        <span className="font-mono text-[7px] text-white/30 uppercase tracking-wider">
          {signal.kind}
        </span>
      )}
    </div>
  );
});

export function OrchestrationHalo({ restoredState }: { restoredState?: HaloState | null } = {}) {
  const { state, motion, restoreState } = useHalo();

  const lastRestoredRef = useRef<HaloState | null>(null);
  useEffect(() => {
    if (restoredState && restoredState !== lastRestoredRef.current) {
      lastRestoredRef.current = restoredState;
      restoreState(restoredState);
    }
  }, [restoredState, restoreState]);

  const core = useMemo(() => CORE_VISUALS[state.coreState], [state.coreState]);
  const isBg = state.intensity === "background";

  return (
    <div className="flex h-10 w-full items-center justify-center relative shrink-0">
      <div className="flex items-center gap-5 px-5 py-2">
        {/* Core Signal — 56px, border only, no fill, no glow */}
        <div
          className="relative flex shrink-0 items-center justify-center"
          style={{ width: 56, height: 56 }}
        >
          <div
            className={`absolute inset-0 rounded-full border ${core.border} transition-all duration-700 ${isBg ? "opacity-50" : ""}`}
            style={{ background: "transparent" }}
          />
          <div
            className={`h-2 w-2 rounded-full transition-all duration-700 ${core.color} ${isBg ? "opacity-60" : ""}`}
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

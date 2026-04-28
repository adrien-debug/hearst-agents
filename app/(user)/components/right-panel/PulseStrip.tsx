"use client";

/**
 * PulseStrip — bandeau d'activité live en tête du RightPanel.
 *
 * Une seule animation : `.halo-core-mini` (anneau rotatif + dot pulse central),
 * couleur pilotée par `data-state` (running/awaiting/error/idle). Pas de
 * progression par phase, pas de step count exposé : juste un signal vivant.
 *
 * Layout : halo (40×40) à gauche · label état + flowLabel au centre (truncate)
 * · 3 compteurs empilés à droite (assets / steps / events).
 */

import { useRuntimeStore } from "@/stores/runtime";
import { HaloLogo3D } from "./HaloLogo3D";

type HaloState = "idle" | "running" | "awaiting" | "error";

export function PulseStrip() {
  const events = useRuntimeStore((s) => s.events);
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);

  const isIdle = coreState === "idle";
  const isError = coreState === "error";
  const isAwaiting =
    coreState === "awaiting_approval" || coreState === "awaiting_clarification";
  const isRunning = !isIdle && !isError && !isAwaiting;

  const haloState: HaloState = isError
    ? "error"
    : isAwaiting
      ? "awaiting"
      : isRunning
        ? "running"
        : "idle";

  const stateColor =
    haloState === "error"
      ? "var(--danger)"
      : haloState === "awaiting"
        ? "var(--warn)"
        : haloState === "running"
          ? "var(--cykan)"
          : "var(--text-faint)";

  const stateLabel =
    haloState === "error"
      ? "erreur"
      : haloState === "awaiting"
        ? "validation"
        : haloState === "running"
          ? "en cours"
          : "veille";

  const generatedAssets = events.filter((e) => e.type === "asset_generated").length;
  const stepCount = events.filter((e) => e.type === "step_started").length;

  return (
    <div
      className="border-b border-[var(--border-shell)] flex items-center gap-3 px-4"
      style={{ height: "72px", background: "var(--surface-1)" }}
      role="status"
      aria-label={`Agents en ${stateLabel}`}
    >
      {/* Logo 3D — H Hearst extrudé, rotation Y en running, signature visuelle */}
      <HaloLogo3D size={56} state={haloState} />

      {/* Centre — label état + flowLabel truncate */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className="t-9 font-mono uppercase tracking-[0.22em] truncate"
          style={{ color: stateColor }}
        >
          {stateLabel}
        </span>
        {flowLabel && (
          <span className="t-11 text-[var(--text-soft)] truncate">{flowLabel}</span>
        )}
      </div>

      {/* Droite — compteurs empilés */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <Counter value={generatedAssets} label="ast" tone={isRunning ? "live" : "idle"} />
        <Counter value={stepCount} label="stp" tone={isRunning ? "live" : "idle"} />
        <Counter value={events.length} label="evt" tone={isRunning ? "live" : "idle"} />
      </div>
    </div>
  );
}

function Counter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "live" | "idle";
}) {
  return (
    <span className="flex items-baseline gap-1.5 leading-none">
      <span
        className={`t-11 font-mono tabular-nums ${
          tone === "live" ? "text-[var(--cykan)]" : "text-[var(--text-faint)]"
        }`}
      >
        {value}
      </span>
      <span className="t-9 font-mono tracking-[0.18em] uppercase text-[var(--text-ghost)]">
        {label}
      </span>
    </span>
  );
}

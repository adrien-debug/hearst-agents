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
      className="border-b border-[var(--border-shell)] flex items-center gap-4 px-4 relative overflow-hidden group"
      style={{ height: "96px", background: "var(--bg-rail)" }}
      role="status"
      aria-label={`Agents en ${stateLabel}`}
    >
      {/* Background decorative elements */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30 transition-opacity duration-slow group-hover:opacity-50"
        style={{ 
          background: `radial-gradient(circle at 20% 50%, ${stateColor}15 0%, transparent 70%)` 
        }} 
      />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dot-grid" />
      
      {/* Top highlight line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[var(--line-strong)] to-transparent" />

      {/* Left: Status Aperture — contient l'élément 3D dans un cadre technique */}
      <div className="relative shrink-0 w-16 h-16 rounded-full border border-[var(--line-strong)] bg-[var(--surface-1)] flex items-center justify-center shadow-lg">
        <div className="absolute inset-0 rounded-full border border-[var(--cykan)] opacity-10 animate-pulse" />
        <HaloLogo3D size={48} state={haloState} />
      </div>

      {/* Centre: Labels — hiérarchie typo renforcée */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <span 
            className="w-1.5 h-1.5 rounded-full" 
            style={{ 
              backgroundColor: stateColor,
              boxShadow: isRunning ? `0 0 8px ${stateColor}` : "none"
            }} 
          />
          <span
            className="t-9 font-mono uppercase tracking-[0.3em]"
            style={{ color: stateColor }}
          >
            {stateLabel}
          </span>
        </div>
        <span className="t-15 font-medium text-[var(--text)] truncate leading-tight">
          {flowLabel || (isIdle ? "Système en veille" : "Initialisation...")}
        </span>
      </div>

      {/* Droite: Runtime HUD — badge agrandi et plus graphique */}
      <div className="flex flex-col gap-1.5 p-2.5 bg-[var(--surface-2)] rounded-[var(--radius-xs)] border border-[var(--line-strong)] min-w-[90px] shadow-inner">
        <div className="flex justify-between items-center gap-4 border-b border-[var(--line)] pb-1 mb-0.5">
          <span className="t-8 font-mono text-[var(--text-ghost)] uppercase tracking-wider">Runtime</span>
          <span className={`t-8 font-mono ${isRunning ? "text-[var(--cykan)]" : "text-[var(--text-ghost)]"}`}>
            {isRunning ? "LIVE" : "IDLE"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <HUDCounter value={generatedAssets} label="AST" tone={isRunning ? "live" : "idle"} />
          <HUDCounter value={stepCount} label="STP" tone={isRunning ? "live" : "idle"} />
          <HUDCounter value={events.length} label="EVT" tone={isRunning ? "live" : "idle"} />
        </div>
      </div>
    </div>
  );
}

function HUDCounter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "live" | "idle";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="t-8 font-mono text-[var(--text-ghost)] uppercase">{label}</span>
      <span
        className={`t-10 font-mono tabular-nums font-bold ${
          tone === "live" ? "text-[var(--cykan)]" : "text-[var(--text-faint)]"
        }`}
      >
        {value.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

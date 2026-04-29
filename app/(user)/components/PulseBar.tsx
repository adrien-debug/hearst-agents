"use client";

/**
 * PulseBar — Barre de statut globale, top fixed (post-pivot 2026-04-29).
 *
 * Toujours visible quel que soit le Stage actif. Quatre clusters :
 *   1. État système : modèles online · services connectés (badge count)
 *   2. Jobs running : missions actives + jobs lourds (image/video/browser/meeting)
 *   3. Voice state : si le mode voice est actif → mini waveform
 *   4. Credits : solde courant en $ + alerte si < seuil
 *
 * V1 (Phase A) : skeleton avec données minimales depuis les stores
 * existants. V2 branchera BullMQ progress + credits ledger live + voice
 * RTC peer state.
 */

import { useMemo } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { useServicesStore } from "@/stores/services";
import { useStageStore } from "@/stores/stage";

export function PulseBar() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const services = useServicesStore((s) => s.services);
  const mode = useStageStore((s) => s.current.mode);

  const connectedCount = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected").length,
    [services],
  );

  const totalServices = services.length;
  const isVoiceActive = mode === "voice";
  const isRunning =
    coreState === "connecting" ||
    coreState === "streaming" ||
    coreState === "processing" ||
    coreState === "awaiting_approval" ||
    coreState === "awaiting_clarification";

  return (
    <div
      className="flex items-center justify-between border-b border-[var(--border-shell)] px-6 shrink-0 z-30"
      style={{ height: "var(--height-pulsebar)", background: "var(--bg-rail)" }}
    >
      {/* Cluster 1 : État système */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span
            className="rounded-pill bg-[var(--cykan)] halo-cyan-sm"
            style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            aria-hidden
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">SYSTEM_OK</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">CONNECTORS</span>
          <span className="t-9 font-mono tracking-display text-[var(--text-muted)]">
            {connectedCount.toString().padStart(2, "0")}/{totalServices.toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Cluster 2 : Jobs running */}
      <div className="flex items-center gap-6">
        {isRunning ? (
          <div className="flex items-center gap-2">
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">RUN_ACTIVE</span>
          </div>
        ) : (
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">IDLE</span>
        )}
      </div>

      {/* Cluster 3 : Voice */}
      <div className="flex items-center gap-6">
        {isVoiceActive && (
          <div className="flex items-center gap-2">
            <span
              className="rounded-pill bg-[var(--cykan)] halo-cyan-sm animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">VOICE_ON</span>
          </div>
        )}

        {/* Cluster 4 : Credits — placeholder Phase A */}
        <div className="flex items-center gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">CREDITS</span>
          <span className="t-9 font-mono tracking-display text-[var(--text-muted)]">$1.00</span>
        </div>
      </div>
    </div>
  );
}

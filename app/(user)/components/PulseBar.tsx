"use client";

/**
 * PulseBar — Header fusionné minimaliste (post-refonte 2026-04-29).
 *
 * Inspiré Linear/Cursor/Vercel : ≤ 56px, drop des status idle/system, Cmd+K
 * central, indicators conditionnels uniquement quand pertinents.
 *
 * Trois zones :
 *   gauche  — hamburger mobile + logo H (clic → cockpit)
 *   centre  — Cmd+K trigger (placeholder rotatif, ouvre Commandeur)
 *   droite  — RUN_ACTIVE/VOICE_ON + cost meter live (conditionnels)
 *
 * Cost meter : poll /api/v2/usage/today au mount + à chaque run_completed
 * + toutes les 60s pour rester live sans saturer l'API.
 */

import { useEffect, useRef, useState } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { GhostIconMenu } from "./ghost-icons";
import { NotificationBell } from "./NotificationBell";

interface UsageToday {
  usedUSD: number;
  budgetUSD: number;
  runs: number;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 0.01) return "$0.00";
  return `$${n.toFixed(2)}`;
}

export function PulseBar() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const mode = useStageStore((s) => s.current.mode);
  const setCommandeurOpen = useStageStore((s) => s.setCommandeurOpen);

  const toggleLeftDrawer = useNavigationStore((s) => s.toggleLeftDrawer);

  const isVoiceActive = mode === "voice";
  const isRunning =
    coreState === "connecting" ||
    coreState === "streaming" ||
    coreState === "processing" ||
    coreState === "awaiting_approval" ||
    coreState === "awaiting_clarification";

  // ── Cost meter live ────────────────────────────────────
  const [usage, setUsage] = useState<UsageToday | null>(null);
  const lastCoreState = useRef<string>(coreState);

  useEffect(() => {
    let cancelled = false;

    async function refreshUsage() {
      try {
        const r = await fetch("/api/v2/usage/today", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as UsageToday;
        if (!cancelled) setUsage(data);
      } catch {
        // Fail-soft : on garde l'ancienne valeur, jamais de crash.
      }
    }

    refreshUsage();
    const interval = setInterval(refreshUsage, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Refresh on run_completed transition (idle ← processing) — le budget
  // bouge à chaque run terminé, autant l'afficher tout de suite.
  useEffect(() => {
    const prev = lastCoreState.current;
    if (prev !== "idle" && coreState === "idle") {
      fetch("/api/v2/usage/today", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: UsageToday | null) => {
          if (data) setUsage(data);
        })
        .catch(() => {});
    }
    lastCoreState.current = coreState;
  }, [coreState]);

  return (
    <div
      className="relative flex items-center border-b border-[var(--border-default)] px-4 shrink-0 z-30"
      style={{ height: "var(--height-pulsebar)", background: "var(--bg-rail)", gap: "var(--space-3)" }}
    >
      {/* Gauche : hamburger mobile uniquement (branding vit dans la sidebar) */}
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={toggleLeftDrawer}
          className="md:hidden w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
          aria-label="Ouvrir les conversations"
        >
          <GhostIconMenu className="w-4 h-4" />
        </button>
      </div>

      {/* Centre : Cmd+K trigger plein-largeur */}
      <button
        type="button"
        onClick={() => setCommandeurOpen(true)}
        className="halo-on-hover flex-1 min-w-0 max-w-xl mx-auto flex items-center justify-between px-3 py-1.5 border border-[var(--border-shell)] rounded-sm text-[var(--text-faint)] hover:border-[var(--cykan-border-hover)] hover:text-[var(--cykan)] transition-colors"
        title="Ouvrir le Commandeur"
      >
        <span className="t-11 truncate">Demande à Hearst…</span>
        <span className="t-9 font-mono shrink-0 ml-3 text-[var(--text-faint)]">⌘K</span>
      </button>

      {/* Droite : run/voice/credits/profile (tout conditionnel).
         Pivot UI 2026-05-01 : on retire les labels mono caps tracking-marquee
         (RUN_ACTIVE / VOICE_ON / CREDITS) qui criaient comme des états critiques
         alors qu'ils étaient juste informationnels. Voix éditoriale calme +
         dot cykan pour l'état système. */}
      <div className="flex items-center shrink-0" style={{ gap: "var(--space-4)" }}>
        {isRunning && (
          <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-11 font-light text-[var(--cykan)]">En cours</span>
          </div>
        )}

        {isVoiceActive && (
          <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
            <span
              className="rounded-pill bg-[var(--cykan)] halo-cyan-sm animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-11 font-light text-[var(--cykan)]">Voix</span>
          </div>
        )}

        {usage && (
          <div
            className="hidden md:flex items-baseline"
            style={{ gap: "var(--space-2)" }}
            title={`${usage.runs} run(s) aujourd'hui — budget ${formatUsd(usage.budgetUSD)}`}
            data-testid="cost-meter"
          >
            <span className="t-11 font-mono tabular-nums text-[var(--text-soft)]">
              {formatUsd(usage.usedUSD)}
            </span>
            <span className="t-11 font-light text-[var(--text-faint)]">
              / {formatUsd(usage.budgetUSD)}
            </span>
          </div>
        )}

        <NotificationBell />
      </div>
    </div>
  );
}

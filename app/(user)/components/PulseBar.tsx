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
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const coreState = useRuntimeStore((s) => s.coreState);
  const mode = useStageStore((s) => s.current.mode);
  const setStageMode = useStageStore((s) => s.setMode);
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

  const goCockpit = () => {
    router.push("/");
    setStageMode({ mode: "cockpit" });
  };

  return (
    <div
      className="relative flex items-center border-b border-[var(--border-default)] px-4 shrink-0 z-30"
      style={{ height: "var(--height-pulsebar)", background: "var(--bg-rail)", gap: "var(--space-3)" }}
    >
      {/* Gauche : hamburger mobile + logo H */}
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={toggleLeftDrawer}
          className="md:hidden w-7 h-7 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
          aria-label="Ouvrir les conversations"
        >
          <GhostIconMenu className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goCockpit}
          className="flex items-center justify-center w-7 h-7 t-15 font-bold tracking-tight text-[var(--cykan)] hover:halo-cyan-sm transition-all shrink-0"
          title="Cockpit"
          aria-label="Aller au Cockpit"
        >
          H
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
        <span className="t-9 font-mono uppercase tracking-marquee shrink-0 ml-3">⌘K</span>
      </button>

      {/* Droite : run/voice/credits/profile (tout conditionnel) */}
      <div className="flex items-center shrink-0" style={{ gap: "var(--space-3)" }}>
        {isRunning && (
          <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">RUN_ACTIVE</span>
          </div>
        )}

        {isVoiceActive && (
          <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
            <span
              className="rounded-pill bg-[var(--cykan)] halo-cyan-sm animate-pulse"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              aria-hidden
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">VOICE_ON</span>
          </div>
        )}

        {usage && (
          <div
            className="hidden md:flex items-center"
            style={{ gap: "var(--space-2)" }}
            title={`${usage.runs} run(s) aujourd'hui — budget ${formatUsd(usage.budgetUSD)}`}
            data-testid="cost-meter"
          >
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              CREDITS
            </span>
            <span className="t-9 font-mono text-[var(--text-muted)]">
              <span className="text-[var(--text)]">{formatUsd(usage.usedUSD)}</span>
              <span className="text-[var(--text-faint)]"> / </span>
              <span>{formatUsd(usage.budgetUSD)}</span>
            </span>
          </div>
        )}

        <NotificationBell />
      </div>
    </div>
  );
}

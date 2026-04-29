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
 *   droite  — RUN_ACTIVE/VOICE_ON (conditionnels)
 *
 * Drop vs version précédente :
 *   - SYSTEM_OK (status nul, "présence de contenu = OK")
 *   - Home/route title (redondant avec Stage actif)
 *   - IDLE (anti-pattern marché 2025)
 *   - CONNECTORS NN/NN (info déplacée dans /apps via Cmd+K)
 *   - CREDITS (faux signal tant que le système de crédits live n'est
 *     pas branché côté serveur — un `$1.00` constant trompe l'œil).
 */

import { useRouter } from "next/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { GhostIconMenu } from "./ghost-icons";

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
      </div>
    </div>
  );
}

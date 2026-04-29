"use client";

/**
 * VoiceStage — Mode voix ambient temps réel (Signature 6).
 *
 * VoicePulse vit au root layout (cf. layout.tsx VoiceMount) — la stage ne
 * monte plus rien côté WebRTC. Elle ne fait que visualiser : cercle pulsant
 * proportionnel au RMS audio, badge phase. Le transcript est affiché par
 * le ContextRail droit (cf. C-light wiring). Tout vient de useVoiceStore.
 */

import { useMemo } from "react";
import { useStageStore } from "@/stores/stage";
import { useVoiceStore, type VoicePhase } from "@/stores/voice";

interface VoiceStageProps {
  sessionId?: string;
}

const PULSE_MIN_PX = 80;
const PULSE_MAX_PX = 200;

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "STANDBY",
  connecting: "CONNECTING…",
  listening: "LISTENING",
  processing: "PROCESSING",
  speaking: "SPEAKING",
  error: "ERROR",
};

const PHASE_COLOR: Record<VoicePhase, string> = {
  idle: "var(--text-faint)",
  connecting: "var(--warn)",
  listening: "var(--cykan)",
  processing: "var(--warn)",
  speaking: "var(--cykan)",
  error: "var(--danger)",
};

export function VoiceStage(_props: VoiceStageProps) {
  const back = useStageStore((s) => s.back);
  const phase = useVoiceStore((s) => s.phase);
  const sessionId = useVoiceStore((s) => s.sessionId);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const error = useVoiceStore((s) => s.error);

  const pulseSize = useMemo(() => {
    const range = PULSE_MAX_PX - PULSE_MIN_PX;
    return PULSE_MIN_PX + Math.max(0, Math.min(audioLevel, 1)) * range;
  }, [audioLevel]);

  // Ordre important : on désactive la session WebRTC AVANT de quitter la
  // stage, sinon le teardown peut foirer si le composant racine VoicePulse
  // unmount pendant que back() change le mode.
  const stopAndExit = () => {
    useVoiceStore.getState().setVoiceActive(false);
    back();
  };

  const phaseColor = PHASE_COLOR[phase];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
          <span
            className="rounded-pill bg-[var(--cykan)] halo-cyan-sm"
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            VOICE_AMBIENT
          </span>
          <span
            className="rounded-pill bg-[var(--text-ghost)]"
            style={{ width: "var(--space-1)", height: "var(--space-1)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
            {sessionId ? sessionId.slice(0, 8) : "STANDBY"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stopAndExit}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--danger)] hover:border-[var(--danger)] transition-all shrink-0"
          >
            Couper
          </button>
          <button
            onClick={back}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          >
            <span>Retour</span>
            <span className="opacity-60">⌘⌫</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center min-h-0 relative">
        <div
          className="rounded-pill bg-[var(--cykan)] halo-cyan-lg"
          style={{
            width: `${pulseSize}px`,
            height: `${pulseSize}px`,
            opacity: 0.4 + Math.min(audioLevel, 1) * 0.4,
            transition:
              "width var(--duration-fast, 160ms) var(--ease-standard, ease), height var(--duration-fast, 160ms) var(--ease-standard, ease), opacity var(--duration-fast, 160ms) var(--ease-standard, ease)",
          }}
          aria-hidden
        />

        <div className="mt-12 flex flex-col items-center gap-3">
          <span
            className="t-9 font-mono uppercase tracking-marquee"
            style={{ color: phaseColor }}
          >
            {PHASE_LABEL[phase]}
          </span>
          {error && (
            <p className="t-11 font-mono uppercase tracking-display text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

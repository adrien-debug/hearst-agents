"use client";

/**
 * VoiceStage — Mode voix ambient temps réel (Signature 6).
 *
 * Le composant VoicePulse (mounted toujours) gère le WebRTC. La stage
 * affiche : un cercle pulsant proportionnel au RMS audio, un badge phase,
 * et un transcript live des 6 dernières échanges. Tout vient de
 * useVoiceStore — pas de prop sessionId nécessaire (ignoré pour compat).
 */

import { useMemo } from "react";
import { useStageStore } from "@/stores/stage";
import { useVoiceStore, type VoicePhase } from "@/stores/voice";
import { VoicePulse } from "../voice/VoicePulse";

interface VoiceStageProps {
  sessionId?: string;
}

const PULSE_MIN_PX = 80;
const PULSE_MAX_PX = 200;
const TRANSCRIPT_TAIL = 6;

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
  const transcript = useVoiceStore((s) => s.transcript);
  const error = useVoiceStore((s) => s.error);
  const reset = useVoiceStore((s) => s.reset);

  const pulseSize = useMemo(() => {
    const range = PULSE_MAX_PX - PULSE_MIN_PX;
    return PULSE_MIN_PX + Math.max(0, Math.min(audioLevel, 1)) * range;
  }, [audioLevel]);

  const tail = transcript.slice(-TRANSCRIPT_TAIL);

  const stopAndExit = () => {
    reset();
    back();
  };

  const phaseColor = PHASE_COLOR[phase];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <VoicePulse />

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
            transition: "width var(--duration-fast, 160ms) var(--ease-standard, ease), height var(--duration-fast, 160ms) var(--ease-standard, ease), opacity var(--duration-fast, 160ms) var(--ease-standard, ease)",
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

      <footer
        className="flex-shrink-0 border-t border-[var(--border-default)] flex flex-col gap-2 overflow-y-auto"
        style={{ padding: "var(--space-6) var(--space-12)", maxHeight: "var(--space-64)" }}
      >
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          TRANSCRIPT
        </span>
        {tail.length === 0 ? (
          <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
            En attente du premier échange…
          </p>
        ) : (
          tail.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <span
                className={`t-9 font-mono uppercase tracking-marquee shrink-0 ${
                  entry.role === "user" ? "text-[var(--cykan)]" : "text-[var(--text-faint)]"
                }`}
              >
                {entry.role === "user" ? "USER" : "AGENT"}
              </span>
              <p
                className={`t-13 ${
                  entry.role === "user" ? "text-[var(--cykan)]" : "text-[var(--text)]"
                }`}
                style={{ lineHeight: "var(--leading-base)" }}
              >
                {entry.text}
              </p>
            </div>
          ))
        )}
      </footer>
    </div>
  );
}

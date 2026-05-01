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
import { StageActionBar, type StageAction } from "./StageActionBar";

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
  //
  // Fallback cockpit : si l'user arrive direct sur voice via ⌘7 sans
  // navigation préalable, history est vide → back() no-op → user resterait
  // visuellement sur voice avec l'orb mais le pipeline coupé.
  const handleCut = () => {
    useVoiceStore.getState().setVoiceActive(false);
    const stage = useStageStore.getState();
    if (stage.history.length > 0) {
      stage.back();
    } else {
      stage.setMode({ mode: "cockpit" });
    }
  };

  const phaseColor = PHASE_COLOR[phase];

  const cutAction: StageAction = {
    id: "cut",
    label: "Couper",
    variant: "danger",
    onClick: handleCut,
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-elev)" }}
    >
      <StageActionBar
        context={
          <>
            <span
              className="rounded-pill bg-[var(--cykan)]"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            />
            <span className="t-11 font-medium text-[var(--cykan)]">
              VOICE
            </span>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            />
            <span className="t-11 font-light text-[var(--text-muted)]">
              {sessionId ? sessionId.slice(0, 8) : "STANDBY"}
            </span>
          </>
        }
        secondary={[cutAction]}
        onBack={back}
      />

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
            className="t-11 font-light"
            style={{ color: phaseColor }}
          >
            {PHASE_LABEL[phase]}
          </span>
          {error && (
            <p className="t-11 font-medium text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

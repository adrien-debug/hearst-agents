"use client";

import { useStageStore } from "@/stores/stage";

interface VoiceStageProps {
  sessionId?: string;
}

/**
 * VoiceStage — Mode voix ambient temps réel (overlay full-screen).
 *
 * V1 (Phase A) : empty state. Phase B branchera OpenAI Realtime API via
 * WebRTC (latence < 500ms) + tools function calling pendant la voix +
 * waveform visuelle ambient.
 *
 * Trigger user : ⌘7 (hotkey global, position 7 dans la grille des Stages)
 * → mint ephemeral token → RTCPeerConnection → user parle naturellement,
 * agent répond ET déclenche des missions Composio en parallèle. Mode
 * persistant tant que l'overlay est ouvert.
 */
export function VoiceStage({ sessionId }: VoiceStageProps) {
  const back = useStageStore((s) => s.back);

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--surface-2)]">
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
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
        >
          <span>Retour</span>
          <span className="opacity-60">ESC</span>
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md flex flex-col gap-6">
          <span
            className="block text-[var(--cykan)] halo-cyan-lg mx-auto t-34 animate-pulse"
            style={{ height: "var(--height-stage-empty-icon)" }}
            aria-hidden
          >
            ⌬
          </span>
          <p
            className="t-15 font-medium tracking-tight text-[var(--text)]"
            style={{ lineHeight: "var(--leading-snug)" }}
          >
            Mode voix prêt à activer
          </p>
          <p
            className="t-13 text-[var(--text-muted)]"
            style={{ lineHeight: "var(--leading-base)" }}
          >
            Conversation full-duplex avec l{"'"}agent, latence sous 500&nbsp;ms.
            Parle naturellement pendant que tu travailles, l{"'"}agent répond ET
            déclenche des actions Composio en parallèle (envoie un Slack, crée
            un ticket, planifie un meeting).
          </p>
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] mt-4">
            CMD+7 pour activer
          </p>
        </div>
      </div>
    </div>
  );
}

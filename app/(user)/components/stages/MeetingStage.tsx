"use client";

import { useStageStore } from "@/stores/stage";

interface MeetingStageProps {
  meetingId: string;
}

/**
 * MeetingStage — Meeting bot live + transcript + action items.
 *
 * V1 (Phase A) : empty state. Phase B branchera Recall.ai bot + Deepgram
 * transcription + action items extractor + bulk approval UI.
 *
 * Trigger user : « Rejoins mon Zoom à 14h » → tool `start_meeting_bot` →
 * worker `meeting-bot` lancé → meetingId stocké → switch Stage vers
 * `meeting`. Le transcript live se construit en SSE → ContextRail
 * action_items → bulk approve → exécution Composio.
 */
export function MeetingStage({ meetingId }: MeetingStageProps) {
  const back = useStageStore((s) => s.back);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-4">
          <span className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot" style={{ width: "var(--space-2)", height: "var(--space-2)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">MEETING_LIVE</span>
          <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
            {meetingId ? meetingId.slice(0, 8) : "STANDBY"}
          </span>
        </div>
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
        >
          <span>Retour</span>
          <span className="opacity-60">⌘⌫</span>
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md" style={{ rowGap: "var(--space-6)", display: "flex", flexDirection: "column" }}>
          <span
            className="block text-[var(--cykan)] opacity-30 halo-cyan-md mx-auto t-34"
            style={{ height: "var(--height-stage-empty-icon)" }}
            aria-hidden
          >
            ◍
          </span>
          <p className="t-15 font-medium tracking-tight text-[var(--text)]" style={{ lineHeight: "var(--leading-snug)" }}>
            Aucun meeting actif
          </p>
          <p className="t-13 text-[var(--text-muted)]" style={{ lineHeight: "var(--leading-base)" }}>
            L'agent peut rejoindre tes meetings Zoom, Meet ou Teams, transcrire en temps réel, détecter les <em>action items</em> et te proposer de les exécuter via Slack, Notion, Linear, Gmail. Demande : <span className="text-[var(--cykan)]">« Rejoins mon Zoom à 14h »</span>.
          </p>
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] mt-4">
            CMD+L pour ouvrir le chat
          </p>
        </div>
      </div>
    </div>
  );
}

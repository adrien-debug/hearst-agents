"use client";

import { useStageStore } from "@/stores/stage";

interface BrowserStageProps {
  sessionId: string;
}

/**
 * BrowserStage — Session browser live co-pilotable.
 *
 * V1 (Phase A) : empty state élégant qui montre comment utiliser le
 * browser agent. Phase B branchera le live view Browserbase + ActionLog
 * + CopilotControls (Pause / Resume / Take Over).
 *
 * Trigger user : « Va sur ces 5 sites et compare leurs prix » → tool
 * `browse_web` → worker `browser-task` → SessionId stocké → switch Stage
 * vers `browser` avec ce sessionId.
 */
export function BrowserStage({ sessionId }: BrowserStageProps) {
  const back = useStageStore((s) => s.back);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-4">
          <span className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot" style={{ width: "var(--space-2)", height: "var(--space-2)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">BROWSER_SESSION</span>
          <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
            {sessionId ? sessionId.slice(0, 8) : "AWAITING"}
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
            ◐
          </span>
          <p className="t-15 font-medium tracking-tight text-[var(--text)]" style={{ lineHeight: "var(--leading-snug)" }}>
            Aucune session browser active
          </p>
          <p className="t-13 text-[var(--text-muted)]" style={{ lineHeight: "var(--leading-base)" }}>
            Demande à l{"'"}agent de naviguer pour toi : <span className="text-[var(--cykan)]">« compare les prix de livraison sur ces 5 sites »</span>. La session live s{"'"}affichera ici, avec un bouton <em>Take Over</em> pour reprendre la main à tout moment.
          </p>
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] mt-4">
            CMD+L pour ouvrir le chat
          </p>
        </div>
      </div>
    </div>
  );
}

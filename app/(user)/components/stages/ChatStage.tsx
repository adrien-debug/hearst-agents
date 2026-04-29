"use client";

import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { ChatMessages } from "../ChatMessages";
import { Breadcrumb, type Crumb } from "../Breadcrumb";
import { RunProgressBanner } from "../RunProgressBanner";
import { FocalStage } from "../FocalStage";
import { WelcomePanel } from "../WelcomePanel";
import type { Message } from "@/lib/core/types";

interface ChatStageProps {
  messages: Message[];
  hasMessages: boolean;
  onSubmit: (message: string) => Promise<void>;
  hasMessagesPlaceholder?: never;
}

/**
 * ChatStage — Conversation classique (mode chat + FocalStage embedded).
 *
 * Garde la composition d'avant le pivot : si un focal object est ouvert,
 * la FocalStage prend le haut, le ChatMessages descend en bas avec une
 * hauteur fixe (320px). Sinon, ChatMessages prend toute la place.
 *
 * Le ChatInput est rendu en bas dans tous les cas — règle UX inchangée.
 */
export function ChatStage({ messages, hasMessages, onSubmit }: ChatStageProps) {
  const focal = useFocalStore((s) => s.focal);
  const isFocalVisible = useFocalStore((s) => s.isVisible);
  const showFocalStage = useFocalStore((s) => s.show);
  const hideFocalStage = useFocalStore((s) => s.hide);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined,
  );

  const focalVisible = !!focal && isFocalVisible;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      {focalVisible && focal && (() => {
        const threadLabel = activeThread?.name?.trim() ?? "";
        const titleLabel = focal.title?.trim() ?? "";
        const looksLikeDuplicate =
          !!threadLabel &&
          !!titleLabel &&
          (titleLabel.toLowerCase().includes(threadLabel.toLowerCase()) ||
            threadLabel.toLowerCase().includes(titleLabel.toLowerCase().slice(0, 32)));
        const focalTypeLabel = (focal.type ?? "DOC").toUpperCase();
        const trail: Crumb[] = looksLikeDuplicate
          ? [{ label: focalTypeLabel }, { label: focal.title, accent: true }]
          : [{ label: threadLabel || "Hearst" }, { label: focalTypeLabel }, { label: focal.title, accent: true }];

        return (
          <div className="flex-1 flex flex-col min-h-0 border-b border-[var(--border-default)] bg-gradient-to-b from-[var(--surface-1)] to-transparent">
            <div className="flex items-center justify-between px-12 py-6 flex-shrink-0 relative z-10 border-b border-[var(--border-default)]">
              <Breadcrumb trail={trail} className="min-w-0 truncate" />
              <button
                onClick={hideFocalStage}
                className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
                title="Fermer (Esc)"
              >
                <span>Fermer</span>
                <span className="opacity-60">ESC</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FocalStage />
            </div>
          </div>
        );
      })()}

      {focal && !isFocalVisible && (
        <div className="flex-shrink-0 px-12 py-8 relative z-10">
          <button onClick={showFocalStage} className="inline-flex items-center gap-6 group">
            <span className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot" style={{ width: "var(--space-2)", height: "var(--space-2)" }} />
            <div className="flex flex-col items-start">
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors">
                {focal.type === "brief" ? "Active Brief" : focal.type === "report" ? "Active Report" : "Active Document"}
              </span>
              <span className="t-15 font-medium tracking-tight text-[var(--text-muted)] group-hover:translate-x-1 group-hover:text-[var(--text)] transition-all duration-slow">
                {focal.title}
              </span>
            </div>
          </button>
        </div>
      )}

      {!hasMessages && !focal && <WelcomePanel />}

      {hasMessages && (
        <div className={focalVisible ? "flex-shrink-0 border-t border-[var(--border-default)] bg-gradient-to-b from-[var(--surface-1)] to-transparent" : "flex-1 min-h-0 bg-gradient-to-b from-[var(--mat-050)] to-[var(--bg-soft)]"} style={focalVisible ? { height: "var(--height-chat-collapsed)" } : undefined}>
          <ChatMessages
            messages={messages}
            compact={focalVisible}
            className={focalVisible ? "h-full overflow-y-auto px-10 py-6 flex flex-col" : "h-full overflow-y-auto px-12 py-10 flex flex-col"}
            onQuickReply={onSubmit}
          />
        </div>
      )}

      <RunProgressBanner />
    </div>
  );
}

"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { ChatToolStream } from "./ChatToolStream";
import { ChatActionReceipts } from "./ChatActionReceipts";
import { ChatConnectInline } from "./ChatConnectInline";
import { ThinkingDisclosure } from "./ThinkingDisclosure";
import { ChatAssetCard } from "./ChatAssetCard";
import { Block, type BlockActionId } from "./chat/Block";
import type { MessageAssetRef } from "@/stores/navigation";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  assetRef?: MessageAssetRef;
}

interface ChatMessagesProps {
  messages: Message[];
  className?: string;
  compact?: boolean;
  source?: string;
  onQuickReply?: (text: string) => void;
}

function parseThinkingBlock(content: string): { thinking: string | null; main: string } {
  const match = content.match(/^<think>([\s\S]*?)<\/think>\n\n([\s\S]*)$/);
  if (match) return { thinking: match[1], main: match[2] };
  return { thinking: null, main: content };
}

// Marker emitted by write-guard / schedule preview tools.
// Matching either French "Réponds confirmer" pattern is enough — both write
// actions and schedule drafts use the same trailer.
function hasPendingConfirmation(content: string): boolean {
  return /Réponds\s+\*\*confirmer\*\*/i.test(content);
}

function tsFromId(id: string): number | null {
  const match = id.match(/-(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

function formatHHMM(ts: number | null): string {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function MetaLine({ author, ts }: { author: string; ts: string }) {
  return (
    <div
      className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]"
      style={{ marginBottom: "var(--space-2)" }}
    >
      <span>{author}</span>
      <span className="text-[var(--text-ghost)]" style={{ marginLeft: "var(--space-2)", marginRight: "var(--space-2)" }}>·</span>
      <span>{ts}</span>
    </div>
  );
}

function StreamShimmer() {
  return (
    <p className="t-13 font-light text-[var(--text-faint)] tracking-tight" style={{ marginTop: "var(--space-2)" }}>
      <span className="chat-typing-dots" aria-hidden>···</span>
    </p>
  );
}

function ConfirmActionChips({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex" style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
      <button
        onClick={onConfirm}
        className="halo-on-hover inline-flex items-center px-3 py-1.5 t-11 font-mono tracking-body uppercase border border-[var(--cykan)] text-[var(--cykan)] bg-[var(--cykan-bg-active)] hover:bg-[var(--cykan-bg-hover)] transition-colors"
        style={{ gap: "var(--space-2)" }}
      >
        <span>Confirmer</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        onClick={onCancel}
        className="inline-flex items-center px-3 py-1.5 t-11 font-mono tracking-body uppercase border border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--danger)] hover:border-[var(--border-default)] transition-colors"
        style={{ gap: "var(--space-2)" }}
      >
        <span>Annuler</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ChatMessages({
  messages,
  className,
  compact = false,
  source,
  onQuickReply,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const coreState = useRuntimeStore((s) => s.coreState);
  const isRunning = coreState !== "idle";
  // Map id → contenu édité localement (refond éditoriale, persistance hors scope).
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleBlockAction = useCallback(
    (messageId: string, content: string, action: BlockActionId) => {
      if (action === "expand") {
        // WorkingDocument (Lot C) écoute cet event pour ouvrir la split view.
        // Contrat de payload : { id, title, content } — cf
        // app/(user)/components/chat/WorkingDocument.tsx::ExpandBlockDetail.
        if (typeof window !== "undefined") {
          const title = content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80) || "Document";
          window.dispatchEvent(
            new CustomEvent("chat:expand-block", {
              detail: { id: messageId, title, content },
            }),
          );
        }
        return;
      }
      if (action === "asset") {
        // Sauvegarde réelle. Stub propre si endpoint absent.
        if (typeof fetch !== "undefined") {
          const title = content.split("\n")[0].slice(0, 80) || "Block";
          fetch("/api/v2/assets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "text",
              name: title,
              metadata: { content, source: "chat-block" },
            }),
          }).catch(() => {
            // Silencieux : feedback est déjà géré côté BlockActions.
          });
        }
        return;
      }
      // mission / refine → toast "Bientôt" géré par BlockActions.
    },
    [],
  );

  if (messages.length === 0) {
    return null;
  }

  const defaultClass = compact
    ? "h-full overflow-y-auto px-7 py-4 flex flex-col"
    : "h-full overflow-y-auto px-10 py-8 flex flex-col";

  const lastMessage = messages[messages.length - 1];
  const lastIsUser = lastMessage?.role === "user";

  return (
    <div ref={scrollRef} className={className ?? defaultClass}>
      <div className="flex-1 min-h-0" />
      <div
        className="flex flex-col shrink-0 mt-auto pb-10 w-full mx-auto max-w-[var(--width-center-max)]"
        style={{ gap: "var(--space-10)" }}
      >
        {messages.map((message, idx) => {
          const ts = formatHHMM(tsFromId(message.id));
          const isLastAssistant = message.role === "assistant" && idx === messages.length - 1;
          const liveContent = edits[message.id] ?? message.content;
          const showCursor = isRunning && isLastAssistant && liveContent.length > 0;

          if (message.role === "user") {
            return (
              <div key={message.id} className="w-full">
                <MetaLine author="Toi" ts={ts} />
                <div className="t-15 font-light leading-relaxed text-[var(--text-soft)] whitespace-pre-wrap">
                  {liveContent}
                </div>
              </div>
            );
          }

          const showShimmer = isLastAssistant && liveContent.length === 0 && isRunning;

          return (
            <div key={message.id} className="relative">
              <MetaLine author={source ?? "Hearst"} ts={ts} />

              {showShimmer ? (
                <>
                  <ChatToolStream />
                  <StreamShimmer />
                </>
              ) : message.assetRef ? (
                <ChatAssetCard assetRef={message.assetRef} />
              ) : (
                <>
                  {(() => {
                    const { thinking, main } = parseThinkingBlock(liveContent);
                    return (
                      <>
                        {thinking && <ThinkingDisclosure thinking={thinking} />}
                        <Block
                          content={main}
                          editable
                          onSave={(updated) =>
                            setEdits((prev) => ({ ...prev, [message.id]: updated }))
                          }
                          onAction={(action) =>
                            handleBlockAction(message.id, main, action)
                          }
                        />
                        {showCursor && (
                          <span
                            className="chat-caret inline-block align-text-bottom"
                            aria-hidden
                          />
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {isLastAssistant && !showShimmer && (
                <>
                  <ChatConnectInline />
                  <ChatActionReceipts />
                </>
              )}
              {isLastAssistant && !showShimmer && hasPendingConfirmation(liveContent) && onQuickReply && (
                <ConfirmActionChips
                  onConfirm={() => onQuickReply("confirmer")}
                  onCancel={() => onQuickReply("annuler")}
                />
              )}
            </div>
          );
        })}

        {isRunning && lastIsUser && (
          <div className="relative">
            <MetaLine author="Hearst" ts="…" />
            <ChatToolStream />
            <StreamShimmer />
          </div>
        )}
      </div>
    </div>
  );
}

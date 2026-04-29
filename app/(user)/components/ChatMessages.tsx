"use client";

import { useRef, useEffect, useState } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { ChatToolStream } from "./ChatToolStream";
import { ChatActionReceipts } from "./ChatActionReceipts";
import { ChatConnectInline } from "./ChatConnectInline";
import { ThinkingDisclosure } from "./ThinkingDisclosure";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
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

function ActionChip({
  label,
  onClick,
  done,
}: {
  label: string;
  onClick?: () => void;
  done?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="halo-on-hover t-9 font-mono tracking-display uppercase px-2 py-1 border border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan)]/30 transition-all bg-transparent"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function AssistantActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div className="flex gap-2 mt-3 opacity-0 -translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-base">
      <ActionChip label="Cite" />
      <ActionChip label="Pin to focal" />
      <ActionChip label="Re-run" />
      <ActionChip label="Copy" onClick={handleCopy} done={copied} />
    </div>
  );
}

function StreamShimmer() {
  return (
    <p className="mt-2 t-13 font-light text-[var(--text-faint)] tracking-tight">
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
    <div className="flex gap-2 mt-3">
      <button
        onClick={onConfirm}
        className="halo-on-hover inline-flex items-center gap-1.5 px-3 py-1.5 t-11 font-mono tracking-body uppercase border border-[var(--cykan)] text-[var(--cykan)] bg-[var(--cykan)]/[0.06] hover:bg-[var(--cykan)]/[0.12] transition-colors"
      >
        <span>Confirmer</span>
        <span aria-hidden>✓</span>
      </button>
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 t-11 font-mono tracking-body uppercase border border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 transition-colors"
      >
        <span>Annuler</span>
        <span aria-hidden>✕</span>
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  const defaultClass = compact
    ? "h-full overflow-y-auto px-7 py-4 flex flex-col"
    : "h-full overflow-y-auto px-10 py-8 flex flex-col";

  const turnGap = compact ? "gap-4" : "gap-6";
  const bodyText = compact ? "t-13" : "t-15";

  const lastMessage = messages[messages.length - 1];
  const lastIsUser = lastMessage?.role === "user";

  return (
    <div ref={scrollRef} className={className ?? defaultClass}>
      <div className="flex-1 min-h-0" />
      <div className={`flex flex-col shrink-0 ${turnGap} mt-auto pb-10 w-full max-w-[720px] mx-auto`}>
        {messages.map((message, idx) => {
          const ts = formatHHMM(tsFromId(message.id));
          const isLastAssistant = message.role === "assistant" && idx === messages.length - 1;
          const showCursor = isRunning && isLastAssistant && message.content.length > 0;

          if (message.role === "user") {
            return (
              <div key={message.id} className="w-full">
                <div className="flex items-center gap-2 mb-1 t-9 font-mono tracking-display uppercase text-[var(--text-faint)]">
                  <span className="opacity-60">[</span>
                  <span className="font-semibold">You</span>
                  <span className="text-[var(--text-ghost)]">·</span>
                  <span>{ts}</span>
                  <span className="opacity-60">]</span>
                </div>
                <div className={`${bodyText} leading-[1.55] tracking-tight text-[var(--cykan)] font-medium whitespace-pre-wrap`}>
                  {message.content}
                </div>
              </div>
            );
          }

          const showShimmer = isLastAssistant && message.content.length === 0 && isRunning;

          return (
            <div key={message.id} className="relative pl-5 group">
              <div className="absolute left-0 top-2 bottom-2 w-px bg-[var(--border-shell)]" />
              <div className="absolute left-[-2px] top-1.5 w-1.5 h-1.5 rounded-pill bg-[var(--cykan)]" />
              <div className="flex items-center gap-2 mb-1.5 t-9 font-mono tracking-display uppercase text-[var(--text-faint)]">
                <span className="opacity-60">[</span>
                {source && (
                  <>
                    <span>{source}</span>
                    <span className="text-[var(--text-ghost)]">·</span>
                  </>
                )}
                <span>{ts}</span>
                <span className="opacity-60">]</span>
              </div>

              {showShimmer ? (
                <>
                  <ChatToolStream />
                  <StreamShimmer />
                </>
              ) : (
                <>
                  {(() => {
                    const { thinking, main } = parseThinkingBlock(message.content);
                    return (
                      <>
                        {thinking && <ThinkingDisclosure thinking={thinking} />}
                        <div className={`${bodyText} leading-[1.55] tracking-tight text-[var(--text)] font-normal whitespace-pre-wrap`}>
                          {main}
                          {showCursor && <span className="chat-caret inline-block align-text-bottom" />}
                        </div>
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
              {isLastAssistant && !showShimmer && hasPendingConfirmation(message.content) && onQuickReply && (
                <ConfirmActionChips
                  onConfirm={() => onQuickReply("confirmer")}
                  onCancel={() => onQuickReply("annuler")}
                />
              )}
              {!showShimmer && message.content.length > 0 && (
                <AssistantActions content={parseThinkingBlock(message.content).main} />
              )}
            </div>
          );
        })}

        {isRunning && lastIsUser && (
          <div className="relative pl-5">
            <div className="absolute left-0 top-2 bottom-2 w-px bg-[var(--border-shell)]" />
            <div className="absolute left-[-2px] top-1.5 w-1.5 h-1.5 rounded-pill bg-[var(--cykan)]" />
            <div className="flex items-center gap-2 mb-1.5 t-9 font-mono tracking-display uppercase text-[var(--text-faint)]">
              <span className="opacity-60">[</span>
              <span>en cours…</span>
              <span className="opacity-60">]</span>
            </div>
            <ChatToolStream />
            <StreamShimmer />
          </div>
        )}

      </div>
    </div>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { useRuntimeStore } from "@/stores/runtime";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatMessagesProps {
  messages: Message[];
  className?: string;
  compact?: boolean;
}

export function ChatMessages({ messages, className, compact = false }: ChatMessagesProps) {
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
    ? "h-full overflow-y-auto px-10 py-6 flex flex-col"
    : "h-full overflow-y-auto px-12 py-12 flex flex-col";

  return (
    <div
      ref={scrollRef}
      className={className ?? defaultClass}
    >
      <div className="flex-1 min-h-0" />
      <div className={`flex flex-col shrink-0 ${compact ? 'gap-12' : 'gap-20'} mt-auto pb-24`}>
        {messages.map((message) => (
          <div
            key={message.id}
            className="flex w-full group"
          >
            <div className="w-16 shrink-0 font-mono text-[10px] text-white/10 pt-4 uppercase tracking-[0.5em]">
              {message.role === "user" ? "USR" : "AI"}
            </div>
            <div
              className={`flex-1 text-[19px] leading-[1.7] tracking-tight ${
                message.role === "user"
                  ? "text-[var(--cykan)] font-black uppercase"
                  : "text-[var(--text-soft)] font-normal"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        
        {isRunning && messages[messages.length - 1]?.role === "user" && (
          <div className="flex w-full">
            <div className="w-16 shrink-0 font-mono text-[10px] text-[var(--cykan)] pt-3 uppercase tracking-[0.5em] animate-pulse">RUN</div>
            <div className="flex gap-3 pt-4">
              <div className="w-1.5 h-1.5 bg-[var(--cykan)] shadow-[0_0_12px_var(--cykan)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 bg-[var(--cykan)] shadow-[0_0_12px_var(--cykan)] animate-bounce" style={{ animationDelay: "200ms" }} />
              <div className="w-1.5 h-1.5 bg-[var(--cykan)] shadow-[0_0_12px_var(--cykan)] animate-bounce" style={{ animationDelay: "400ms" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

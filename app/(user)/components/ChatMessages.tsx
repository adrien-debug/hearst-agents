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
    ? "h-full overflow-y-auto px-8 py-5 flex flex-col bg-gradient-to-b from-transparent to-white/[0.01]"
    : "h-full overflow-y-auto px-10 py-10 flex flex-col bg-gradient-to-b from-transparent via-white/[0.01] to-white/[0.02]";

  return (
    <div
      ref={scrollRef}
      className={className ?? defaultClass}
    >
      <div className="flex-1 min-h-0" />
      <div className={`flex flex-col shrink-0 ${compact ? 'gap-8' : 'gap-12'} mt-auto pb-16`}>
        {messages.map((message) => (
          <div
            key={message.id}
            className="flex w-full group"
          >
            <div className="w-12 shrink-0 font-mono text-[10px] text-white/40 pt-1 uppercase tracking-[0.15em]">
              {message.role === "user" ? "You" : "AI"}
            </div>
            <div
              className={`flex-1 text-[15px] leading-[1.6] tracking-normal ${
                message.role === "user"
                  ? "text-white font-medium"
                  : "text-white/80 font-normal"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        
        {isRunning && messages[messages.length - 1]?.role === "user" && (
          <div className="flex w-full">
            <div className="w-12 shrink-0 font-mono text-[10px] text-[var(--cykan)] pt-1 uppercase tracking-[0.15em] animate-pulse">Run</div>
            <div className="flex gap-2 pt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-bounce" style={{ animationDelay: "200ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--cykan)] animate-bounce" style={{ animationDelay: "400ms" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

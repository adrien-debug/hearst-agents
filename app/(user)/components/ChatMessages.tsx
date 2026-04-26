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
    ? "h-full overflow-y-auto px-4 py-3 space-y-3"
    : "h-full overflow-y-auto px-4 py-6 space-y-4";

  return (
    <div
      ref={scrollRef}
      className={className ?? defaultClass}
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex w-full ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[85%] px-5 py-4 text-[15px] leading-relaxed rounded-[8px] border border-[var(--line-strong)] ${
              message.role === "user"
                ? "bg-[var(--bg-elev)] text-[var(--cykan)] font-bold"
                : "bg-[var(--bg-elev)] text-[var(--text)] font-medium"
            }`}
          >
            {message.content}
          </div>
        </div>
      ))}
      
      {isRunning && messages[messages.length - 1]?.role === "user" && (
        <div className="flex w-full justify-start">
          <div className="px-5 py-4 border border-[var(--line-strong)] bg-[var(--bg-elev)] rounded-[8px]">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--text-muted)] font-mono tracking-widest uppercase">Traitement...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

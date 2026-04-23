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
}

export function ChatMessages({ messages }: ChatMessagesProps) {
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

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              message.role === "user"
                ? "bg-cyan-500/20 text-white border border-cyan-500/30"
                : "bg-white/[0.05] text-white/90 border border-white/[0.08]"
            }`}
          >
            {message.content}
          </div>
        </div>
      ))}
      
      {isRunning && messages[messages.length - 1]?.role === "user" && (
        <div className="flex justify-start">
          <div className="bg-white/[0.05] text-white/90 border border-white/[0.08] rounded-2xl px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-white/60">En réflexion...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

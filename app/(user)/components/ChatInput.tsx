"use client";

import { useState, useRef, useEffect } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
}

export function ChatInput({ onSubmit, placeholder }: ChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const surface = useNavigationStore((s) => s.surface);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!input.trim() || isRunning) return;
    onSubmit(input.trim());
    setInput("");
  };

  const surfacePlaceholders: Record<string, string> = {
    home: "Que puis-je faire pour vous ?",
    inbox: "Rechercher dans vos messages...",
    calendar: "Quels événements chercher ?",
    files: "Quels documents trouver ?",
    tasks: "Créer ou gérer une mission...",
    apps: "Configurer un connecteur...",
  };

  return (
    <div className="p-4 border-t border-white/[0.06] bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-[#141414] border border-white/10 rounded-xl px-4 py-3 focus-within:border-cyan-500/30 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder={placeholder || surfacePlaceholders[surface] || "Que puis-je faire pour vous ?"}
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none resize-none min-h-[20px] max-h-[200px] leading-relaxed"
          />
          {isRunning ? (
            <div className="w-8 h-8 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/40 hover:bg-cyan-500 hover:text-black disabled:opacity-30 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-[10px] text-white/20 text-center mt-2">Entrée pour envoyer · Maj+Entrée pour nouvelle ligne</p>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceDefinition } from "@/lib/integrations/types";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
  connectedServices?: ServiceDefinition[];
  onProviderMention?: (providerId: string) => void;
}

export function ChatInput({
  onSubmit,
  placeholder,
  connectedServices = [],
  onProviderMention,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const surface = useNavigationStore((s) => s.surface);
  const typeaheadRef = useRef<HTMLDivElement>(null);
  const [hideTypeahead, setHideTypeahead] = useState(false);

  // Parse @mention from input
  const lastAtIndex = input.lastIndexOf("@");
  const afterAt = lastAtIndex !== -1 ? input.slice(lastAtIndex + 1) : "";
  const hasSpace = afterAt.includes(" ");
  const typeaheadQuery = !hasSpace ? afterAt.toLowerCase() : "";
  const showTypeahead = lastAtIndex !== -1 && !hasSpace && !hideTypeahead;

  // Close typeahead when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (typeaheadRef.current && !typeaheadRef.current.contains(e.target as Node)) {
        setHideTypeahead(true);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset hide when input changes (allows reopening after @)
  useEffect(() => {
    if (hideTypeahead && input.includes("@")) {
      const timeout = setTimeout(() => setHideTypeahead(false), 0);
      return () => clearTimeout(timeout);
    }
  }, [input, hideTypeahead]);

  // Filter services for typeahead (connected only)
  const matchingServices = connectedServices.filter((service) =>
    service.id.toLowerCase().includes(typeaheadQuery) ||
    service.name.toLowerCase().includes(typeaheadQuery)
  ).slice(0, 5);

  // Handle service selection from typeahead
  function selectService(service: ServiceDefinition) {
    const beforeAt = input.slice(0, lastAtIndex);
    const afterQuery = input.slice(lastAtIndex + 1 + typeaheadQuery.length);
    const newInput = `${beforeAt}@${service.id} ${afterQuery}`;
    setInput(newInput);
    setHideTypeahead(true);
    onProviderMention?.(service.id);
    inputRef.current?.focus();
  }

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit() {
    if (!input.trim() || isRunning) return;
    onSubmit(input.trim());
    setInput("");
    setHideTypeahead(true);
  }

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
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="mb-2 bg-[#141414] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
          >
            {matchingServices.length === 0 ? (
              <div className="p-3 text-xs text-white/40">
                {typeaheadQuery ? (
                  <>Aucune source trouvée pour &quot;{typeaheadQuery}&quot;</>
                ) : (
                  <>Tapez @ pour mentionner une source connectée</>
                )}
              </div>
            ) : (
              <div className="py-1">
                {matchingServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => selectService(service)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-lg">{service.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white">@{service.id}</p>
                      <p className="text-[10px] text-white/40">{service.name}</p>
                    </div>
                    <span className="text-xs text-emerald-400">●</span>
                  </button>
                ))}
              </div>
            )}
            {typeaheadQuery && !matchingServices.some((s) => s.id === typeaheadQuery) && (
              <div className="px-3 py-2 border-t border-white/[0.06]">
                <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                  Voir les apps non connectées →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input Container */}
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
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (showTypeahead && matchingServices.length > 0) {
                  selectService(matchingServices[0]);
                } else {
                  handleSubmit();
                }
              }
              if (e.key === "Escape") {
                setHideTypeahead(true);
              }
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
        <p className="text-[10px] text-white/20 text-center mt-2">
          Entrée pour envoyer · Maj+Entrée pour nouvelle ligne · @ pour mentionner
        </p>
      </div>
    </div>
  );
}

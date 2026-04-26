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
    <div className="px-6 py-6 bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto relative">
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="absolute bottom-full mb-4 w-full bg-[var(--bg-elev)] border border-[var(--line-strong)] rounded-[8px] overflow-hidden z-50"
          >
            {matchingServices.length === 0 ? (
              <div className="p-3 text-xs text-[var(--text-muted)]">
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
                      <p className="text-sm text-[var(--text)]">@{service.id}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{service.name}</p>
                    </div>
                    <span className="text-xs text-[var(--money)]">●</span>
                  </button>
                ))}
              </div>
            )}
            {typeaheadQuery && !matchingServices.some((s) => s.id === typeaheadQuery) && (
              <div className="px-3 py-2 border-t border-[var(--line)]">
                <button className="text-xs text-[var(--cykan)] hover:text-[var(--cykan)]/80 transition-colors">
                  Voir les apps non connectées →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input Container */}
        <div
          className="flex items-end gap-3 border border-[var(--line-strong)] px-5 py-4 rounded-[8px] focus-within:border-[var(--cykan)] bg-[var(--bg-elev)] transition-all duration-150"
        >
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
            className="flex-1 bg-transparent text-[15px] font-medium tracking-wide text-[var(--text)] placeholder:text-[var(--text-faint)] border-0 focus:ring-0 focus:outline-none resize-none min-h-[24px] max-h-[200px] leading-relaxed p-0 m-0"
          />
          {isRunning ? (
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <div
                className="w-5 h-5 border-2 border-[var(--text-faint)] border-t-[var(--cykan)] rounded-full animate-spin"
                style={{ boxShadow: "var(--glow-cyan-sm)" }}
              />
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--cykan)] disabled:opacity-30 disabled:hover:text-[var(--text-muted)] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <div className="absolute left-0 right-0 -bottom-5 flex justify-center opacity-40 hover:opacity-100 transition-opacity">
          <p className="text-[11px] text-[var(--text-faint)] font-medium tracking-widest uppercase">
            Entrée <span className="text-[var(--text-muted)]">pour envoyer</span> <span className="mx-2">·</span> Maj+Entrée <span className="text-[var(--text-muted)]">pour nouvelle ligne</span> <span className="mx-2">·</span> @ <span className="text-[var(--text-muted)]">pour lier</span>
          </p>
        </div>
      </div>
    </div>
  );
}

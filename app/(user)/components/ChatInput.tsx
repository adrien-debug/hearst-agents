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
    home: "Poser une question",
    inbox: "Chercher dans les messages…",
    calendar: "Une question sur votre agenda ?",
    files: "Trouver un document…",
    tasks: "Créer une mission…",
    apps: "Configurer les connecteurs…",
  };

  return (
    <div className="px-10 pt-5 pb-8 border-t border-[var(--border-shell)]">
      <div
        className="mx-auto relative"
        style={{ maxWidth: "var(--input-max-width)" }}
      >
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="absolute bottom-full mb-8 w-full bg-[var(--bg)] rounded-lg border border-[var(--surface-2)] overflow-hidden z-50"
          >
            {matchingServices.length === 0 ? (
              <div className="p-4 t-11 font-mono tracking-display text-[var(--text-faint)]">
                {typeaheadQuery ? (
                  <>Aucune source trouvée&nbsp;: {typeaheadQuery}</>
                ) : (
                  <>Tapez @ pour mentionner une source</>
                )}
              </div>
            ) : (
              <div className="py-2">
                {matchingServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => selectService(service)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-all duration-base group"
                  >
                    <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{service.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium tracking-tight text-[var(--text)]">@{service.id}</p>
                      <p className="t-10 font-mono tracking-display text-[var(--text-faint)]">{service.name}</p>
                    </div>
                    <span className="t-10 font-mono text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-opacity">Link</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input Card — textarea en haut, actions en bas */}
        <div
          className="bg-[var(--card-flat-bg)] border border-[var(--border-input)] rounded-2xl transition-colors duration-base group focus-within:border-[var(--cykan-border-hover)]"
          style={{ boxShadow: "var(--shadow-card)" }}
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
            placeholder={placeholder || surfacePlaceholders[surface] || "Poser une question"}
            rows={1}
            className="block w-full bg-transparent text-base font-normal tracking-normal text-[var(--text)] placeholder:text-[var(--text-placeholder)] border-0 focus:ring-0 focus:outline-none resize-none leading-relaxed pt-4 pb-2 px-5"
            style={{ minHeight: "32px", maxHeight: "200px" }}
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <span className="t-9 font-mono tracking-marquee uppercase text-[var(--text-faint)] px-2">
              Auto
            </span>
            {isRunning ? (
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 border-2 border-[var(--surface-2)] border-t-[var(--cykan)] rounded-pill animate-spin" />
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className={`w-8 h-8 flex items-center justify-center shrink-0 transition-all duration-base ${
                  input.trim()
                    ? "bg-[var(--cykan)] text-[var(--bg)] border border-[var(--cykan)]"
                    : "bg-transparent text-[var(--text-faint)] border border-[var(--border-default)] cursor-not-allowed"
                }`}
                style={input.trim() ? { boxShadow: "0 0 24px rgba(45,212,191,0.40)" } : {}}
                title="Envoyer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="absolute left-0 right-0 -bottom-5 flex justify-center opacity-30 hover:opacity-100 transition-opacity">
          <p className="t-9 text-[var(--text-soft)] font-mono tracking-display">
            Entrée pour envoyer · Maj+Entrée nouvelle ligne · @ pour mentionner
          </p>
        </div>
      </div>
    </div>
  );
}

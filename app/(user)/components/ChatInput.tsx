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
    home: "Ask anything...",
    inbox: "Search messages...",
    calendar: "Ask about your schedule...",
    files: "Find documents...",
    tasks: "Create a mission...",
    apps: "Configure connectors...",
  };

  return (
    <div className="px-10 py-12 bg-gradient-to-t from-[#050505] via-[#080808] to-transparent">
      <div className="max-w-4xl mx-auto relative">
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="absolute bottom-full mb-8 w-full bg-black/95 backdrop-blur-xl rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden z-50"
          >
            {matchingServices.length === 0 ? (
              <div className="p-4 text-[11px] font-mono tracking-wide text-white/40">
                {typeaheadQuery ? (
                  <>No source found: {typeaheadQuery}</>
                ) : (
                  <>Type @ to mention a source</>
                )}
              </div>
            ) : (
              <div className="py-2">
                {matchingServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => selectService(service)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-all duration-200 group"
                  >
                    <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{service.icon}</span>
                    <div className="flex-1">
                      <p className="text-[14px] font-medium tracking-tight text-white">@{service.id}</p>
                      <p className="text-[10px] font-mono tracking-wide text-white/40">{service.name}</p>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-opacity">Link</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input Container */}
        <div
          className="flex items-end gap-6 px-8 py-6 bg-white/[0.015] border border-white/[0.05] transition-all duration-500 group focus-within:bg-white/[0.03] focus-within:border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.5)] rounded-sm"
        >
          <span className="text-[11px] font-mono text-[var(--cykan)] pt-2 opacity-30 group-focus-within:opacity-100 transition-opacity tracking-[0.2em]">&gt;</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
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
            placeholder={placeholder || surfacePlaceholders[surface] || "Type a message..."}
            rows={1}
            className="flex-1 bg-transparent text-[16px] font-normal tracking-normal text-white placeholder:text-white/[0.2] border-0 focus:ring-0 focus:outline-none resize-none min-h-[28px] max-h-[150px] leading-relaxed p-0 m-0"
          />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.05] overflow-hidden">
            <div className="h-full bg-[var(--cykan)] w-0 group-focus-within:w-full transition-all duration-500 ease-out" />
          </div>
          {isRunning ? (
            <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <div
                className="w-4 h-4 border-2 border-white/10 border-t-[var(--cykan)] rounded-full animate-spin"
              />
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-8 h-8 flex items-center justify-center shrink-0 text-white/30 hover:text-black hover:bg-[var(--cykan)] transition-all duration-300 rounded-sm disabled:opacity-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <div className="absolute left-0 right-0 -bottom-8 flex justify-center opacity-30 hover:opacity-100 transition-opacity">
          <p className="text-[9px] text-white font-mono tracking-[0.15em]">
            Enter to send · Shift+Enter for new line · @ to mention
          </p>
        </div>
      </div>
    </div>
  );
}

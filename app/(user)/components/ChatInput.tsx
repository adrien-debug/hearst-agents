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
    home: "ENTER_COMMAND_",
    inbox: "SEARCH_MESSAGES_",
    calendar: "QUERY_SCHEDULE_",
    files: "LOCATE_DOCUMENTS_",
    tasks: "INIT_MISSION_",
    apps: "CONFIG_CONNECTORS_",
  };

  return (
    <div className="px-12 py-20 bg-transparent">
      <div className="max-w-6xl mx-auto relative">
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="absolute bottom-full mb-12 w-full bg-black/95 backdrop-blur-3xl rounded-[12px] shadow-[0_40px_100px_rgba(0,0,0,0.9)] border border-white/10 overflow-hidden z-50"
          >
            {matchingServices.length === 0 ? (
              <div className="p-8 text-[12px] font-mono uppercase tracking-[0.3em] text-white/30">
                {typeaheadQuery ? (
                  <>No_Source_Found: {typeaheadQuery}</>
                ) : (
                  <>Mention_Source: @</>
                )}
              </div>
            ) : (
              <div className="py-4">
                {matchingServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => selectService(service)}
                    className="w-full flex items-center gap-8 px-8 py-5 text-left hover:bg-white/5 transition-all duration-300 group"
                  >
                    <span className="text-3xl grayscale group-hover:grayscale-0 transition-all">{service.icon}</span>
                    <div className="flex-1">
                      <p className="text-[16px] font-black uppercase tracking-tighter text-white">@{service.id}</p>
                      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">{service.name}</p>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-opacity tracking-widest">LINK_</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input Container */}
        <div
          className="flex items-end gap-10 px-12 py-12 bg-white/[0.015] border border-white/[0.05] transition-all duration-1000 group focus-within:bg-white/[0.03] focus-within:border-white/[0.1] shadow-[0_40px_100px_rgba(0,0,0,0.6)] rounded-sm"
        >
          <span className="text-[12px] font-mono text-[var(--cykan)] pt-5 opacity-20 group-focus-within:opacity-100 transition-opacity tracking-[0.4em]">HEARST_OS &gt;</span>
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
            placeholder={placeholder || surfacePlaceholders[surface] || "ENTER_COMMAND_"}
            rows={1}
            className="flex-1 bg-transparent text-[38px] font-light tracking-tighter text-white placeholder:text-white/[0.04] border-0 focus:ring-0 focus:outline-none resize-none min-h-[48px] max-h-[200px] leading-tight p-0 m-0"
          />
          <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-white/[0.03] overflow-hidden">
            <div className="h-full bg-[var(--cykan)] w-0 group-focus-within:w-full transition-all duration-1000 ease-in-out shadow-[0_0_30px_var(--cykan)]" />
          </div>
          {isRunning ? (
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <div
                className="w-6 h-6 border-[3px] border-white/5 border-t-[var(--cykan)] rounded-full animate-spin shadow-[0_0_20px_var(--cykan)]"
              />
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-12 h-12 flex items-center justify-center shrink-0 text-white/10 hover:text-black hover:bg-[var(--cykan)] transition-all duration-500 rounded-sm disabled:opacity-0"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <div className="absolute left-0 right-0 -bottom-10 flex justify-center opacity-20 hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-white font-mono tracking-[0.6em] uppercase">
            [ENT] SEND_ [SHIFT+ENT] LINE_ [@] LINK_
          </p>
        </div>
      </div>
    </div>
  );
}

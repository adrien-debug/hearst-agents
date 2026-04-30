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
  const [attachment, setAttachment] = useState<{
    fileName: string;
    text: string;
    pageCount: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      if (
        typeaheadRef.current &&
        !typeaheadRef.current.contains(e.target as Node)
      ) {
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
  const matchingServices = connectedServices
    .filter(
      (service) =>
        service.id.toLowerCase().includes(typeaheadQuery) ||
        service.name.toLowerCase().includes(typeaheadQuery),
    )
    .slice(0, 5);

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    if (!input.trim() || isRunning) return;
    const finalMessage = attachment
      ? `Document analysé (${attachment.fileName}, ${attachment.pageCount} pages) :\n\n${attachment.text}\n\n---\n\n${input.trim()}`
      : input.trim();
    onSubmit(finalMessage);
    setInput("");
    setAttachment(null);
    setUploading(false);
    setHideTypeahead(true);
  }

  const surfacePlaceholders: Record<string, string> = {
    home: "Pose une question",
    inbox: "Cherche un message…",
    calendar: "Demande des infos sur ton agenda",
    files: "Trouve un document…",
    tasks: "Crée une mission…",
    apps: "Configure tes connecteurs…",
  };

  return (
    <div className="px-6 py-6">
      <div
        className="mx-auto relative"
        style={{ maxWidth: "var(--input-max-width)" }}
      >
        {/* @mention Typeahead */}
        {showTypeahead && (
          <div
            ref={typeaheadRef}
            className="absolute bottom-full mb-4 w-full rounded-2xl border border-[var(--border-shell)] overflow-hidden z-50"
            style={{ background: "var(--mat-300)", boxShadow: "var(--shadow-card-hover)" }}
          >
            {matchingServices.length === 0 ? (
              <div className="p-4 t-11 tracking-display uppercase text-[var(--text-ghost)]">
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
                    className="w-full flex items-center gap-4 px-4 py-3 text-left border-b border-[var(--line)] transition-all duration-300 group hover:bg-[var(--surface-1)]"
                  >
                    <span className="t-18 text-[var(--text-faint)] group-hover:text-[var(--cykan)] transition-colors">
                      {service.icon}
                    </span>
                    <div className="flex-1">
                      <p className="t-13 font-medium tracking-wide text-[var(--text-soft)] group-hover:text-white transition-colors">
                        @{service.id}
                      </p>
                      <p className="t-10 tracking-snug uppercase text-[var(--text-ghost)] mt-0.5">
                        {service.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input Pill — focal glass premium */}
        <div className="cockpit-input-pill peer group px-10 py-7 backdrop-blur-xl relative">
          {attachment && (
            <div className="flex items-center gap-3 px-1 pb-4 mb-4 border-b border-[var(--line)]">
              <span className="t-9 tracking-marquee uppercase text-[var(--cykan)]">
                PDF
              </span>
              <span className="t-13 text-[var(--text-muted)] truncate max-w-xs font-light">
                {attachment.fileName}
              </span>
              <span className="t-10 tracking-display text-[var(--text-ghost)]">
                {attachment.pageCount}P
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="ml-auto t-13 text-[var(--text-ghost)] hover:text-[var(--danger)] transition-colors"
                aria-label="Retirer le document"
              >
                ×
              </button>
            </div>
          )}
          {uploadError && (
            <p className="t-10 tracking-wide text-[var(--danger)] px-1 pb-3">
              {uploadError}
            </p>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
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
            placeholder={
              placeholder ||
              surfacePlaceholders[surface] ||
              "Demande n'importe quoi…"
            }
            rows={1}
            className="block w-full bg-transparent t-18 font-light text-[var(--text)] placeholder:text-[var(--text-faint)] border-0 focus:ring-0 focus:outline-none resize-none leading-relaxed py-1"
            style={{
              minHeight: "var(--height-input-min)",
              maxHeight: "var(--height-input-max)",
            }}
          />

          <div className="flex items-center justify-end gap-4 pt-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setUploading(true);
                  fetch("/api/v2/documents/upload", {
                    method: "POST",
                    body: (() => {
                      const fd = new FormData();
                      fd.append("file", file);
                      return fd;
                    })(),
                    credentials: "include",
                  })
                    .then(async (r) => {
                      const data = (await r.json()) as {
                        fileName?: string;
                        text?: string;
                        pageCount?: number;
                        error?: string;
                      };
                      if (!r.ok) throw new Error(data.error ?? "Erreur upload");
                      setAttachment({
                        fileName: data.fileName ?? file.name,
                        text: data.text ?? "",
                        pageCount: data.pageCount ?? 0,
                      });
                    })
                    .catch(() => {
                      setUploadError("Échec du parsing PDF");
                      setTimeout(() => setUploadError(null), 4000);
                    })
                    .finally(() => setUploading(false));
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isRunning}
                title={uploading ? "Analyse en cours…" : "Joindre un PDF"}
                className={`transition-all duration-500 ${
                  uploading
                    ? "text-[var(--warn)] animate-pulse"
                    : attachment
                      ? "text-[var(--cykan)]"
                      : "text-[var(--text-ghost)] hover:text-[var(--text-muted)]"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              {isRunning ? (
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <div className="w-3 h-3 border border-[var(--border-subtle)] border-t-[var(--cykan)] rounded-full animate-spin" />
                </div>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className={`transition-all duration-500 ${
                    input.trim()
                      ? "text-[var(--cykan)] scale-110 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                      : "text-[var(--text-ghost)] cursor-not-allowed hover:text-[var(--text-faint)]"
                  }`}
                  title="Envoyer"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              )}
          </div>
        </div>
        <div className="absolute left-0 right-0 -bottom-8 flex justify-center opacity-0 peer-focus-within:opacity-100 transition-opacity duration-emphasis ease-out-soft">
          <p className="t-9 text-[var(--text-ghost)] tracking-body uppercase">
            Entrée pour envoyer · Maj+Entrée pour saut de ligne · @ pour mentionner
          </p>
        </div>
      </div>
    </div>
  );
}

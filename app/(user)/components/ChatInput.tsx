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
    home: "Poser une question",
    inbox: "Chercher dans les messages…",
    calendar: "Une question sur votre agenda ?",
    files: "Trouver un document…",
    tasks: "Créer une mission…",
    apps: "Configurer les connecteurs…",
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
            className="absolute bottom-full mb-4 w-full rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden z-50 bg-[#0A0A0A] shadow-2xl"
          >
            {matchingServices.length === 0 ? (
              <div className="p-4 t-11 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)]">
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
                    className="w-full flex items-center gap-4 px-4 py-3 text-left border-b border-[rgba(255,255,255,0.03)] transition-all duration-300 group hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <span className="t-18 text-[rgba(255,255,255,0.4)] group-hover:text-[var(--cykan)] transition-colors">
                      {service.icon}
                    </span>
                    <div className="flex-1">
                      <p className="t-13 font-medium tracking-wide text-[rgba(255,255,255,0.9)] group-hover:text-white transition-colors">
                        @{service.id}
                      </p>
                      <p className="t-10 tracking-[0.1em] uppercase text-[rgba(255,255,255,0.3)] mt-0.5">
                        {service.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input Pill — High-end minimal design */}
        <div
          className="rounded-[32px] group border border-[rgba(255,255,255,0.06)] transition-all duration-500 px-6 py-5 focus-within:border-[rgba(45,212,191,0.3)] focus-within:shadow-[0_0_30px_rgba(45,212,191,0.05)]"
          style={{
            background: "rgba(255,255,255,0.015)",
            color: "var(--text)",
          }}
        >
          {attachment && (
            <div className="flex items-center gap-3 px-1 pb-3 mb-2 border-b border-[rgba(255,255,255,0.04)]">
              <span className="t-9 tracking-[0.2em] uppercase text-[var(--cykan)]">
                PDF
              </span>
              <span className="t-13 text-[rgba(255,255,255,0.7)] truncate max-w-xs font-light">
                {attachment.fileName}
              </span>
              <span className="t-10 tracking-widest text-[rgba(255,255,255,0.3)]">
                {attachment.pageCount}p
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="ml-auto t-13 text-[rgba(255,255,255,0.3)] hover:text-[var(--danger)] transition-colors"
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
              "Poser une question"
            }
            rows={1}
            className="block w-full bg-transparent t-15 font-light text-[rgba(255,255,255,0.9)] placeholder:text-[rgba(255,255,255,0.25)] border-0 focus:ring-0 focus:outline-none resize-none leading-relaxed py-1"
            style={{
              minHeight: "var(--height-input-min)",
              maxHeight: "var(--height-input-max)",
            }}
          />
          
          <div className="flex items-center justify-between pt-4 mt-1">
            <span className="t-9 tracking-[0.25em] uppercase text-[rgba(255,255,255,0.3)] px-1">
              Auto
            </span>
            <div className="flex items-center gap-3">
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
                className={`w-8 h-8 flex items-center justify-center transition-all duration-300 ${
                  uploading
                    ? "text-[var(--warn)] animate-pulse"
                    : attachment
                      ? "text-[var(--cykan)]"
                      : "text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)]"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              {isRunning ? (
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <div className="w-4 h-4 border-2 border-[rgba(255,255,255,0.1)] border-t-[var(--cykan)] rounded-full animate-spin" />
                </div>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-md transition-all duration-300 ${
                    input.trim()
                      ? "border border-[rgba(45,212,191,0.3)] text-[var(--cykan)] bg-[rgba(45,212,191,0.05)] hover:bg-[rgba(45,212,191,0.1)] hover:shadow-[0_0_15px_rgba(45,212,191,0.15)]"
                      : "border border-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.2)] bg-transparent cursor-not-allowed"
                  }`}
                  title="Envoyer"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="absolute left-0 right-0 -bottom-8 flex justify-center opacity-40 hover:opacity-100 transition-opacity">
          <p className="t-9 text-[rgba(255,255,255,0.3)] tracking-[0.15em] uppercase">
            Entrée pour envoyer · Maj+Entrée nouvelle ligne · @ pour mentionner
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceDefinition } from "@/lib/integrations/types";
import { ContextChips } from "./chat/ContextChips";
import { readAssetDragPayload, type AssetDragPayload } from "./use-asset-drag";
import { PersonaSwitcher } from "./PersonaSwitcher";

// Lazy-load : modal rendu uniquement à la première ouverture (gain bundle
// initial du chat ~5-8 KB selon le contenu de DocumentParseModal).
const DocumentParseModal = lazy(() =>
  import("./DocumentParseModal").then((m) => ({ default: m.DocumentParseModal })),
);

interface ChatInputProps {
  onSubmit: (
    message: string,
    opts?: { attachedAssetIds?: string[]; personaId?: string | null },
  ) => void;
  placeholder?: string;
  connectedServices?: ServiceDefinition[];
  onProviderMention?: (providerId: string) => void;
  /** Thread courant — utilisé pour scoper la persona active per-thread. */
  threadId?: string | null;
}

export function ChatInput({
  onSubmit,
  placeholder,
  connectedServices = [],
  onProviderMention,
  threadId = null,
}: ChatInputProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<{
    fileName: string;
    text: string;
    pageCount: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageGenStatus, setImageGenStatus] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [imageGenMessage, setImageGenMessage] = useState<string | null>(null);
  const [audioGenStatus, setAudioGenStatus] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [audioGenMessage, setAudioGenMessage] = useState<string | null>(null);
  const [codeExecStatus, setCodeExecStatus] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [codeExecMessage, setCodeExecMessage] = useState<string | null>(null);
  const [docParseOpen, setDocParseOpen] = useState(false);
  const [docParseMessage, setDocParseMessage] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Pill étendue dès qu'il y a du focus ou du texte
  const isExpanded = inputFocused || input.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunning = useRuntimeStore((s) => s.coreState !== "idle");
  const surface = useNavigationStore((s) => s.surface);
  const typeaheadRef = useRef<HTMLDivElement>(null);
  const [hideTypeahead, setHideTypeahead] = useState(false);
  const [attachedAssets, setAttachedAssets] = useState<AssetDragPayload[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [personaId, setPersonaId] = useState<string | null>(null);

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

  // Quick-mention depuis la rangée d'icônes sous l'input. Insère
  // `@<service.id>` à la fin du texte courant (avec espace de séparation
  // si nécessaire), focus le textarea. Si l'user était en train de taper
  // un `@<query>`, on remplace cette query par le service complet.
  function insertMentionFromIcon(service: ServiceDefinition) {
    if (lastAtIndex !== -1 && !hasSpace) {
      selectService(service);
      return;
    }
    const trail = input.length === 0 || input.endsWith(" ") ? "" : " ";
    setInput(`${input}${trail}@${service.id} `);
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
    const attachedAssetIds = attachedAssets.map((a) => a.assetId);
    const opts: { attachedAssetIds?: string[]; personaId?: string | null } = {};
    if (attachedAssetIds.length > 0) opts.attachedAssetIds = attachedAssetIds;
    if (personaId) opts.personaId = personaId;
    onSubmit(finalMessage, Object.keys(opts).length > 0 ? opts : undefined);
    setInput("");
    setAttachment(null);
    setAttachedAssets([]);
    setUploading(false);
    setHideTypeahead(true);
  }

  function handleAssetDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const payload = readAssetDragPayload(event);
    if (!payload) return;
    if (attachedAssets.some((a) => a.assetId === payload.assetId)) return;
    setAttachedAssets((prev) => [...prev, payload]);
    const mention = `@asset:${payload.title}`;
    setInput((prev) => (prev.endsWith(" ") || prev.length === 0 ? prev + mention + " " : prev + " " + mention + " "));
    inputRef.current?.focus();
  }

  function handleAssetDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("application/x-hearst-asset+json")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  }

  function handleAssetDragLeave() {
    setIsDragOver(false);
  }

  function removeAttachedAsset(assetId: string) {
    setAttachedAssets((prev) => prev.filter((a) => a.assetId !== assetId));
  }

  async function handleImageGen() {
    const prompt = input.trim();
    if (!prompt || imageGenStatus === "pending") return;
    setImageGenStatus("pending");
    setImageGenMessage("Génération de l'image en cours…");
    try {
      const res = await fetch("/api/v2/jobs/image-gen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        const reason = data.message ?? data.error ?? "Erreur génération image";
        throw new Error(reason);
      }
      setImageGenStatus("idle");
      setImageGenMessage("Image en préparation — elle apparaîtra dans tes assets.");
      setInput("");
      setTimeout(() => setImageGenMessage(null), 4000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Erreur génération image";
      setImageGenStatus("error");
      setImageGenMessage(reason);
      setTimeout(() => {
        setImageGenStatus("idle");
        setImageGenMessage(null);
      }, 5000);
    }
  }

  async function handleAudioGen() {
    const text = input.trim();
    if (!text || audioGenStatus === "pending") return;
    setAudioGenStatus("pending");
    setAudioGenMessage("Synthèse audio en cours…");
    try {
      const res = await fetch("/api/v2/jobs/audio-gen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        const reason = data.message ?? data.error ?? "Erreur synthèse audio";
        throw new Error(reason);
      }
      setAudioGenStatus("idle");
      setAudioGenMessage("Audio en préparation — il apparaîtra dans tes assets.");
      setInput("");
      setTimeout(() => setAudioGenMessage(null), 4000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Erreur synthèse audio";
      setAudioGenStatus("error");
      setAudioGenMessage(reason);
      setTimeout(() => {
        setAudioGenStatus("idle");
        setAudioGenMessage(null);
      }, 5000);
    }
  }

  function extractCodeBlock(value: string): {
    code: string;
    runtime: "python" | "node";
  } | null {
    const fenced = value.match(/```(\w+)?\n([\s\S]*?)```/);
    if (fenced) {
      const lang = (fenced[1] ?? "").toLowerCase();
      const runtime: "python" | "node" =
        lang === "js" || lang === "javascript" || lang === "node" || lang === "typescript"
          ? "node"
          : "python";
      return { code: fenced[2].trim(), runtime };
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { code: trimmed, runtime: "python" };
  }

  async function handleCodeExec() {
    if (codeExecStatus === "pending") return;
    const extracted = extractCodeBlock(input);
    if (!extracted || !extracted.code) return;
    setCodeExecStatus("pending");
    setCodeExecMessage("Exécution sandbox en cours…");
    try {
      const res = await fetch("/api/v2/jobs/code-exec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: extracted.code, runtime: extracted.runtime }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        const reason = data.message ?? data.error ?? "Erreur exécution code";
        throw new Error(reason);
      }
      setCodeExecStatus("idle");
      setCodeExecMessage("Exécution lancée — résultat dans tes assets.");
      setInput("");
      setTimeout(() => setCodeExecMessage(null), 4000);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Erreur exécution code";
      setCodeExecStatus("error");
      setCodeExecMessage(reason);
      setTimeout(() => {
        setCodeExecStatus("idle");
        setCodeExecMessage(null);
      }, 5000);
    }
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
    <div className="px-4 py-2">
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
              <div className="p-4 t-11 font-light text-[var(--text-ghost)]">
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
                      <p className="t-13 font-medium tracking-wide text-[var(--text-soft)] group-hover:text-[var(--text)] transition-colors">
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

        {/* Context chips au-dessus de l'input */}
        <div className="px-2">
          <ContextChips />
        </div>

        {/* Input "two-lines" — pivot 2026-05-03. Deux filets top/bottom
           en gradient (fade aux extrémités), background transparent, plus
           de coquille ni de halo cykan. Drag-over passe en cykan via le
           data-drag-over (CSS le pickup, pas de style inline). */}
        <div
          className="cockpit-input-pill-line peer group px-6 py-3 relative"
          onDragOver={handleAssetDragOver}
          onDragLeave={handleAssetDragLeave}
          onDrop={handleAssetDrop}
          data-drag-over={isDragOver}
        >
          {attachedAssets.length > 0 && (
            <div
              className="flex flex-wrap items-center"
              style={{
                gap: "var(--space-2)",
                marginBottom: "var(--space-3)",
                paddingBottom: "var(--space-3)",
                borderBottom: "1px solid var(--line)",
              }}
            >
              {attachedAssets.map((a) => (
                <span
                  key={a.assetId}
                  data-testid={`chat-input-attached-asset-${a.assetId}`}
                  className="flex items-center"
                  style={{
                    gap: "var(--space-2)",
                    padding: "var(--space-1) var(--space-3)",
                    background: "var(--cykan-surface)",
                    border: "1px solid var(--cykan)",
                    borderRadius: "var(--radius-pill)",
                  }}
                >
                  <span className="t-11 font-medium text-[var(--cykan)]">
                    @{a.kind}
                  </span>
                  <span className="t-11 font-light text-[var(--text)] truncate" style={{ maxWidth: "var(--space-32)" }}>
                    {a.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachedAsset(a.assetId)}
                    aria-label={`Retirer ${a.title}`}
                    className="t-11 text-[var(--text-ghost)] hover:text-[var(--danger)]"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {attachment && (
            <div className="flex items-center gap-3 px-1 pb-4 mb-4 border-b border-[var(--line)]">
              <span className="t-9 font-medium text-[var(--cykan)]">
                PDF
              </span>
              <span className="t-13 text-[var(--text-muted)] truncate max-w-xs font-light">
                {attachment.fileName}
              </span>
              <span className="t-9 font-mono tabular-nums text-[var(--text-ghost)]">
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
          {imageGenMessage && (
            <p
              className={`t-10 tracking-wide px-1 pb-3 ${
                imageGenStatus === "error"
                  ? "text-[var(--danger)]"
                  : "text-[var(--cykan)]"
              }`}
            >
              {imageGenMessage}
            </p>
          )}
          {audioGenMessage && (
            <p
              className={`t-10 tracking-wide px-1 pb-3 ${
                audioGenStatus === "error"
                  ? "text-[var(--danger)]"
                  : "text-[var(--cykan)]"
              }`}
            >
              {audioGenMessage}
            </p>
          )}
          {codeExecMessage && (
            <p
              className={`t-10 tracking-wide px-1 pb-3 ${
                codeExecStatus === "error"
                  ? "text-[var(--danger)]"
                  : "text-[var(--cykan)]"
              }`}
            >
              {codeExecMessage}
            </p>
          )}
          {docParseMessage && (
            <p className="t-10 tracking-wide px-1 pb-3 text-[var(--cykan)]">
              {docParseMessage}
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
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
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
            className="block w-full bg-transparent t-18 font-light text-[var(--text)] placeholder:text-[var(--text-muted)] border-0 focus:ring-0 focus:outline-none resize-none leading-relaxed py-1"
            style={{
              minHeight: "var(--space-9)",
              maxHeight: "var(--height-input-max)",
            }}
          />

          <div className={isExpanded ? "flex items-center justify-end gap-4 pt-2" : "hidden"}>
              <PersonaSwitcher
                threadId={threadId}
                onChange={(id) => setPersonaId(id)}
              />
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
                onClick={handleAudioGen}
                disabled={!input.trim() || audioGenStatus === "pending" || isRunning}
                title={
                  audioGenStatus === "pending"
                    ? "Synthèse en cours…"
                    : "Synthétiser le texte en audio"
                }
                aria-label="Synthétiser en audio"
                className={`transition-colors duration-base ${
                  audioGenStatus === "pending"
                    ? "text-[var(--warn)] animate-pulse"
                    : audioGenStatus === "error"
                      ? "text-[var(--danger)]"
                      : input.trim()
                        ? "text-[var(--text-l2)] hover:text-[var(--cykan)]"
                        : "text-[var(--text-l3)] cursor-not-allowed"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleCodeExec}
                disabled={!input.trim() || codeExecStatus === "pending" || isRunning}
                title={
                  codeExecStatus === "pending"
                    ? "Exécution en cours…"
                    : "Exécuter le code dans un sandbox"
                }
                aria-label="Exécuter du code"
                className={`transition-colors duration-base ${
                  codeExecStatus === "pending"
                    ? "text-[var(--warn)] animate-pulse"
                    : codeExecStatus === "error"
                      ? "text-[var(--danger)]"
                      : input.trim()
                        ? "text-[var(--text-l2)] hover:text-[var(--cykan)]"
                        : "text-[var(--text-l3)] cursor-not-allowed"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleImageGen}
                disabled={!input.trim() || imageGenStatus === "pending" || isRunning}
                title={
                  imageGenStatus === "pending"
                    ? "Génération en cours…"
                    : "Générer une image depuis le prompt"
                }
                aria-label="Générer une image"
                className={`transition-colors duration-base ${
                  imageGenStatus === "pending"
                    ? "text-[var(--warn)] animate-pulse"
                    : imageGenStatus === "error"
                      ? "text-[var(--danger)]"
                      : input.trim()
                        ? "text-[var(--text-l2)] hover:text-[var(--cykan)]"
                        : "text-[var(--text-l3)] cursor-not-allowed"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDocParseOpen(true)}
                disabled={isRunning}
                title="Parser un document depuis une URL (LlamaParse)"
                aria-label="Parser un document"
                data-testid="chat-input-document-parse"
                className={`transition-colors duration-base ${
                  isRunning
                    ? "text-[var(--text-l3)] cursor-not-allowed"
                    : "text-[var(--text-l2)] hover:text-[var(--cykan)]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="15" y2="17" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isRunning}
                title={uploading ? "Analyse en cours…" : "Joindre un PDF"}
                aria-label="Joindre un PDF"
                className={`transition-colors duration-base ${
                  uploading
                    ? "text-[var(--warn)] animate-pulse"
                    : attachment
                      ? "text-[var(--cykan)]"
                      : "text-[var(--text-l2)] hover:text-[var(--cykan)]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
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
                  aria-label="Envoyer"
                  className={`transition-colors duration-base ${
                    input.trim()
                      ? "text-[var(--cykan)]"
                      : "text-[var(--text-l3)] cursor-not-allowed hover:text-[var(--text-l2)]"
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
        {/* Quick-mention apps — clic logo → @mention ; + vers /apps */}
        {connectedServices.length > 0 && (
          <div
            className="mt-3 flex items-center justify-center"
            style={{ gap: "var(--space-2)", minHeight: "var(--space-5)" }}
            aria-label="Mention rapide d'une app connectée"
          >
            <div
              className="flex items-center overflow-x-auto scrollbar-hide"
              style={{ gap: "var(--space-2)" }}
            >
              {connectedServices.slice(0, 12).map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => insertMentionFromIcon(service)}
                  title={`Mentionner @${service.id}`}
                  aria-label={`Mentionner ${service.name}`}
                  className="inline-flex items-center justify-center shrink-0 transition-opacity hover:opacity-100"
                  style={{
                    width: "var(--space-5)",
                    height: "var(--space-5)",
                    opacity: 0.7,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={service.icon}
                    alt=""
                    width={16}
                    height={16}
                    aria-hidden
                  />
                </button>
              ))}
              {connectedServices.length > 12 && (
                <span
                  className="t-9 font-mono shrink-0"
                  style={{ color: "var(--text-faint)" }}
                  aria-hidden
                >
                  +{connectedServices.length - 12}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push("/apps")}
              title="Connecter une nouvelle app"
              aria-label="Connecter une nouvelle app"
              className="inline-flex items-center justify-center shrink-0 transition-colors text-[var(--text-faint)] hover:text-[var(--cykan)]"
              style={{
                width: "var(--space-5)",
                height: "var(--space-5)",
                marginLeft: "var(--space-2)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {docParseOpen && (
        <Suspense fallback={null}>
          <DocumentParseModal
            open={docParseOpen}
            onClose={() => setDocParseOpen(false)}
            onSuccess={() => {
              setDocParseMessage(
                "Document en parsing — il apparaîtra dans tes assets.",
              );
              setTimeout(() => setDocParseMessage(null), 4000);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

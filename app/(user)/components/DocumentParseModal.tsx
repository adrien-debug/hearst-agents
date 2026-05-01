"use client";

/**
 * DocumentParseModal — déclenche un job document-parse async.
 *
 * Pattern Phase A : input URL + sélecteur mimeType. Le user colle une
 * URL accessible (Drive public, S3 signed, etc.) ; le worker LlamaParse
 * télécharge et produit un asset document parsé.
 *
 * Phase B (TODO) : remplacer par un upload natif → R2 → fileUrl auto.
 * La route /api/v2/documents/upload existe mais retourne le markdown
 * parsé inline, pas une URL persistée. Ajouter un endpoint
 * /api/v2/uploads dédié quand l'infra storage tenant-scoped sera prête.
 *
 * Tokens uniquement (CLAUDE.md §1).
 */

import { useEffect, useRef, useState } from "react";
import { Action } from "./ui";

export interface DocumentParseModalProps {
  open: boolean;
  threadId?: string;
  onClose: () => void;
  onSuccess?: (jobId: string) => void;
}

const MIME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "application/pdf", label: "PDF" },
  {
    value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  { value: "text/plain", label: "TXT" },
  { value: "text/markdown", label: "Markdown" },
];

export function DocumentParseModal({
  open,
  threadId,
  onClose,
  onSuccess,
}: DocumentParseModalProps) {
  const [fileUrl, setFileUrl] = useState("");
  const [mimeType, setMimeType] = useState(MIME_OPTIONS[0].value);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFileUrl("");
    setFileName("");
    setMimeType(MIME_OPTIONS[0].value);
    setStatus("idle");
    setErrorMsg(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === "Escape" && status !== "submitting") {
        resetState();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, status, onClose]);

  if (!open) return null;

  function isValidUrl(u: string): boolean {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  async function handleSubmit() {
    if (status === "submitting") return;
    const url = fileUrl.trim();
    if (!isValidUrl(url)) {
      setStatus("error");
      setErrorMsg("URL invalide — http(s) attendu");
      return;
    }
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v2/jobs/document-parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileUrl: url,
          mimeType,
          fileName: fileName.trim() || undefined,
          threadId,
        }),
      });
      const data = (await res.json()) as {
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Erreur parsing document");
      }
      onSuccess?.(data.jobId ?? "");
      resetState();
      onClose();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Erreur parsing document");
    }
  }

  const submitting = status === "submitting";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-parse-modal-title"
      data-testid="document-parse-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex flex-col w-full"
        style={{
          maxWidth: "var(--input-max-width)",
          padding: "var(--space-6)",
          gap: "var(--space-4)",
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-card-hover)",
          marginLeft: "var(--space-4)",
          marginRight: "var(--space-4)",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          <h2
            id="document-parse-modal-title"
            className="t-15 font-medium text-[var(--text)]"
            style={{ margin: 0, lineHeight: "var(--leading-snug)" }}
          >
            Parser un document
          </h2>
          <p
            className="t-11 font-light text-[var(--text-muted)]"
            style={{ margin: 0, lineHeight: 1.5 }}
          >
            Colle l&apos;URL d&apos;un document accessible (Drive, S3 signé,
            CDN public). Phase B : upload natif.
          </p>
        </div>

        <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <span className="t-11 font-light text-[var(--text-faint)]">
            URL du fichier
          </span>
          <input
            ref={inputRef}
            type="url"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://…/document.pdf"
            data-testid="document-parse-modal-url"
            className="t-13 font-light text-[var(--text)]"
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-shell)",
              borderRadius: "var(--radius-xs)",
              outline: "none",
            }}
            disabled={submitting}
          />
        </label>

        <div
          className="grid"
          style={{
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-3)",
          }}
        >
          <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <span className="t-11 font-light text-[var(--text-faint)]">
              Type
            </span>
            <select
              value={mimeType}
              onChange={(e) => setMimeType(e.target.value)}
              data-testid="document-parse-modal-mime"
              className="t-13 font-light text-[var(--text)]"
              style={{
                padding: "var(--space-2) var(--space-3)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-shell)",
                borderRadius: "var(--radius-xs)",
                outline: "none",
              }}
              disabled={submitting}
            >
              {MIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <span className="t-11 font-light text-[var(--text-faint)]">
              Nom (optionnel)
            </span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Mon document"
              data-testid="document-parse-modal-name"
              className="t-13 font-light text-[var(--text)]"
              style={{
                padding: "var(--space-2) var(--space-3)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-shell)",
                borderRadius: "var(--radius-xs)",
                outline: "none",
              }}
              disabled={submitting}
            />
          </label>
        </div>

        {errorMsg && (
          <p
            className="t-11 font-light text-[var(--danger)]"
            style={{ margin: 0 }}
          >
            {errorMsg}
          </p>
        )}

        <div
          className="flex items-center justify-end"
          style={{ gap: "var(--space-2)" }}
        >
          <Action
            variant="secondary"
            tone="neutral"
            size="sm"
            onClick={handleClose}
            disabled={submitting}
            testId="document-parse-modal-cancel"
          >
            Annuler
          </Action>
          <Action
            variant="primary"
            tone="brand"
            size="sm"
            onClick={handleSubmit}
            disabled={!fileUrl.trim()}
            loading={submitting}
            testId="document-parse-modal-submit"
          >
            Parser
          </Action>
        </div>
      </div>
    </div>
  );
}

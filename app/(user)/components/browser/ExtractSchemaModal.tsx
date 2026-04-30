"use client";

import { useEffect, useRef, useState } from "react";

interface ExtractSchemaModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { instruction: string; schema?: Record<string, unknown> }) => void;
  loading?: boolean;
}

const DEFAULT_SCHEMA = `{
  "title": "string",
  "price": "number"
}`;

export function ExtractSchemaModal({
  open,
  onClose,
  onSubmit,
  loading,
}: ExtractSchemaModalProps) {
  const [instruction, setInstruction] = useState("");
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA);
  const [parseError, setParseError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    setParseError(null);
    let schema: Record<string, unknown> | undefined;
    if (schemaText.trim()) {
      try {
        const parsed = JSON.parse(schemaText) as unknown;
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Le schema doit être un objet JSON.");
        }
        schema = parsed as Record<string, unknown>;
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Schema JSON invalide");
        return;
      }
    }
    if (!instruction.trim()) {
      setParseError("Décris ce que l'agent doit extraire.");
      return;
    }
    onSubmit({ instruction: instruction.trim(), schema });
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center px-4"
      style={{ background: "var(--overlay-scrim)", zIndex: "var(--z-modal)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Extraction structurée"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl flex flex-col gap-4 p-6 rounded-md border border-[var(--border-default)]"
        style={{ background: "var(--bg-elev)" }}
      >
        <div className="flex items-center justify-between">
          <span className="t-11 font-light text-[var(--text-faint)]">
            EXTRACT
          </span>
          <button
            type="button"
            onClick={onClose}
            className="t-13 text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <p
          className="t-15 text-[var(--text)]"
          style={{ lineHeight: "var(--leading-snug)" }}
        >
          Décris ce que l{"'"}agent doit extraire de la page courante.
        </p>

        <label className="flex flex-col gap-2">
          <span className="t-11 font-light text-[var(--text-faint)]">
            INSTRUCTION
          </span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="ex: extrais le titre et le prix du produit affiché"
            rows={2}
            className="w-full p-3 rounded-md border border-[var(--border-input)] t-13 text-[var(--text)] font-mono"
            style={{ background: "var(--bg-soft)" }}
            disabled={loading}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-11 font-light text-[var(--text-faint)]">
            SCHEMA (JSON)
          </span>
          <textarea
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            rows={8}
            className="w-full p-3 rounded-md border border-[var(--border-input)] t-13 text-[var(--text)] font-mono"
            style={{ background: "var(--bg-soft)" }}
            disabled={loading}
            spellCheck={false}
          />
        </label>

        {parseError && (
          <p className="t-11 font-medium text-[var(--danger)]">
            {parseError}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 t-11 font-light text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="px-6 py-2 t-11 font-medium bg-[var(--cykan)] text-[var(--text-on-cykan)] disabled:opacity-60"
          >
            {loading ? "Extraction…" : "Extraire"}
          </button>
        </div>
      </div>
    </div>
  );
}

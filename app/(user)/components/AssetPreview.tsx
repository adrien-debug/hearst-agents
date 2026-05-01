"use client";

import { useState } from "react";
import type { Asset, AssetKind } from "@/lib/assets/types";
import { Action } from "./ui";

interface AssetPreviewProps {
  asset: Asset;
  onDownload?: () => void;
}

// Libellé lisible par `kind` V2 (report/brief/document/spreadsheet/message/task/event).
const KIND_REF: Record<AssetKind, string> = {
  report: "TYPE_RPT",
  brief: "TYPE_BRF",
  document: "TYPE_DOC",
  spreadsheet: "TYPE_XLSX",
  message: "TYPE_TXT",
  task: "TYPE_TASK",
  event: "TYPE_EVT",
  inbox_brief: "TYPE_INB",
  daily_brief: "TYPE_DBR",
  artifact: "TYPE_ART",
};

const MIME_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF Document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet",
  "text/csv": "CSV File",
  "application/json": "JSON File",
  "text/plain": "Text File",
};

// Extrait le texte de narration quand contentRef est du JSON V2.
function extractNarration(contentRef: string | undefined): string | undefined {
  if (!contentRef) return undefined;
  if (!contentRef.trimStart().startsWith("{")) return contentRef;
  try {
    const parsed = JSON.parse(contentRef) as { narration?: string };
    return parsed.narration;
  } catch {
    return contentRef;
  }
}

export function AssetPreview({ asset, onDownload }: AssetPreviewProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    if (!onDownload) return;
    setIsLoading(true);
    try {
      await onDownload();
    } finally {
      setIsLoading(false);
    }
  };

  const pdfFile = asset.provenance?.pdfFile;
  const kindRef = KIND_REF[asset.kind] ?? "TYPE_ASSET";
  const mimeLabel = pdfFile?.mimeType ? (MIME_TYPE_LABELS[pdfFile.mimeType] ?? asset.kind.toUpperCase()) : asset.kind.toUpperCase();
  const canPreviewInline = ["message", "brief"].includes(asset.kind);
  const narration = extractNarration(asset.contentRef);

  return (
    <div className="border-t border-[var(--ghost-modal-top)] bg-[var(--bg)] overflow-hidden">
      <div className="p-6 border-b border-[var(--line)] flex flex-wrap items-start gap-6">
        <span
          className="font-mono t-9 uppercase text-[var(--text-muted)] border-b border-[var(--cykan)] pb-1"
          style={{ letterSpacing: "var(--tracking-banner)" }}
        >
          {kindRef}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="t-15 font-black uppercase tracking-tighter text-[var(--text)] truncate">
            {asset.title}
          </h3>
          <p className="t-11 font-light text-[var(--text-muted)] mt-2">
            {mimeLabel}
            {pdfFile?.sizeBytes != null && (
              <span className="ml-3 font-mono t-10">
                SIZE_{(pdfFile.sizeBytes / 1024).toFixed(1)}KB
              </span>
            )}
          </p>
        </div>
        {onDownload && (
          <Action
            variant="primary"
            tone="brand"
            size="sm"
            onClick={handleDownload}
            disabled={!pdfFile}
            loading={isLoading}
          >
            Télécharger
          </Action>
        )}
      </div>

      <div className="p-6 min-h-[200px] flex items-center justify-center border-b border-[var(--line)]">
        {canPreviewInline && narration ? (
          <div className="w-full max-h-96 overflow-auto bg-[var(--bg-elev)] p-4 font-mono t-11 text-[var(--text-muted)] border border-[var(--line)]">
            <pre className="whitespace-pre-wrap">{narration}</pre>
          </div>
        ) : narration ? (
          <div className="w-full max-h-96 overflow-auto p-4 t-13 text-[var(--text-soft)] leading-relaxed prose prose-invert max-w-none">
            {narration}
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="t-11 font-medium text-[var(--text-faint)]">
              {kindRef.toLowerCase()}
            </p>
            <p className="t-9 font-light text-[var(--text-muted)]">
              {pdfFile ? "Fichier binaire — téléchargement disponible" : "Aucun contenu preview disponible"}
            </p>
          </div>
        )}
      </div>

      <div className="p-6 bg-[var(--bg-soft)]">
        <p className="t-11 font-medium text-[var(--text-l1)] mb-4">Métadonnées</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 t-11 font-light text-[var(--text-muted)]">
          <div>
            <span className="text-[var(--text-faint)]">Réf</span>
            <span className="ml-2 font-mono">{asset.id.slice(0, 8)}…</span>
          </div>
          {asset.runId && (
            <div>
              <span className="text-[var(--text-faint)]">Run</span>
              <span className="ml-2 font-mono">{asset.runId.slice(0, 8)}…</span>
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[var(--text-faint)]">TS_CREATED</span>
            <span className="ml-2">{new Date(asset.createdAt).toLocaleString()}</span>
          </div>
          {asset.provenance?.userId && (
            <div>
              <span className="text-[var(--text-faint)]">ACTOR</span>
              <span className="ml-2">{asset.provenance.userId}</span>
            </div>
          )}
          {asset.provenance?.specId && (
            <div>
              <span className="text-[var(--text-faint)]">SPEC</span>
              <span className="ml-2">{asset.provenance.specId}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

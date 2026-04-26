"use client";

import { useState } from "react";
import type { RuntimeAsset, AssetType } from "@/lib/engine/runtime/assets/types";

interface AssetPreviewProps {
  asset: RuntimeAsset;
  onDownload?: () => void;
}

const TYPE_REF: Record<AssetType, string> = {
  pdf: "TYPE_PDF",
  excel: "TYPE_XLSX",
  doc: "TYPE_DOC",
  json: "TYPE_JSON",
  csv: "TYPE_CSV",
  report: "TYPE_RPT",
  text: "TYPE_TXT",
};

const MIME_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF Document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet",
  "text/csv": "CSV File",
  "application/json": "JSON File",
  "text/plain": "Text File",
};

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

  const canPreviewInline = ["json", "csv", "text"].includes(asset.type);
  const typeRef = TYPE_REF[asset.type] ?? "TYPE_ASSET";

  return (
    <div className="border-t border-[var(--ghost-modal-top)] bg-[var(--bg)] overflow-hidden">
      <div className="p-6 border-b border-[var(--line)] flex flex-wrap items-start gap-6">
        <span className="font-mono t-9 uppercase tracking-[0.25em] text-[var(--text-muted)] border-b border-[var(--cykan)] pb-1">{typeRef}</span>
        <div className="flex-1 min-w-0">
          <h3 className="t-15 font-black uppercase tracking-tighter text-[var(--text)] truncate">{asset.name}</h3>
          <p className="t-11 font-light text-[var(--text-muted)] mt-2">
            {MIME_TYPE_LABELS[asset.file?.mimeType || ""] || asset.type.toUpperCase()}
            {asset.file?.sizeBytes && (
              <span className="ml-3 font-mono t-10">SIZE_{(asset.file.sizeBytes / 1024).toFixed(1)}KB</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isLoading}
          className="ghost-btn-solid ghost-btn-cykan rounded-sm shrink-0 disabled:opacity-40"
        >
          {isLoading ? "FETCH…" : "DOWNLOAD"}
        </button>
      </div>

      <div className="p-6 min-h-[200px] flex items-center justify-center border-b border-[var(--line)]">
        {canPreviewInline ? (
          <div className="w-full max-h-96 overflow-auto bg-[var(--bg-elev)] p-4 font-mono t-11 text-[var(--text-muted)] border border-[var(--line)]">
            <p className="text-[var(--text-faint)] italic">PREVIEW_PENDING</p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="font-mono t-10 uppercase tracking-[0.3em] text-[var(--text-faint)]">{typeRef}_VIEW</p>
            <p className="text-xs font-light text-[var(--text-muted)]">
              {asset.type === "pdf" && "PDF — téléchargement requis"}
              {asset.type === "excel" && "Excel — téléchargement requis"}
              {asset.type === "doc" && "Document — téléchargement requis"}
              {asset.type === "report" && "Rapport — téléchargement requis"}
            </p>
          </div>
        )}
      </div>

      <div className="p-6 bg-[var(--bg-soft)]">
        <p className="ghost-meta-label mb-4">META_ROW</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 t-11 font-mono text-[var(--text-muted)]">
          <div>
            <span className="text-[var(--text-faint)]">ID_REF</span>
            <span className="ml-2">{asset.id.slice(0, 8)}…</span>
          </div>
          <div>
            <span className="text-[var(--text-faint)]">RUN_REF</span>
            <span className="ml-2">{asset.run_id.slice(0, 8)}…</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[var(--text-faint)]">TS_CREATED</span>
            <span className="ml-2">{new Date(asset.created_at).toLocaleString()}</span>
          </div>
          {(() => {
            const createdBy = asset.metadata?.createdBy;
            if (typeof createdBy === "string") {
              return (
                <div>
                  <span className="text-[var(--text-faint)]">ACTOR</span>
                  <span className="ml-2">{createdBy}</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}

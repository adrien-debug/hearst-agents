"use client";

import { useState } from "react";
import type { Asset, AssetType } from "@/lib/runtime/assets/types";

interface AssetPreviewProps {
  asset: Asset;
  onDownload?: () => void;
}

const ASSET_ICONS: Record<AssetType, string> = {
  pdf: "📄",
  excel: "📊",
  doc: "📝",
  json: "📋",
  csv: "📉",
  report: "📑",
  text: "📃",
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

  // Inline content preview (for text-based assets)
  const canPreviewInline = ["json", "csv", "text"].includes(asset.type);

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center gap-4">
        <span className="text-3xl">{ASSET_ICONS[asset.type]}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-white truncate">{asset.name}</h3>
          <p className="text-sm text-white/40">
            {MIME_TYPE_LABELS[asset.file?.mimeType || ""] || asset.type.toUpperCase()}
            {asset.file?.sizeBytes && (
              <span className="ml-2">• {(asset.file.sizeBytes / 1024).toFixed(1)} KB</span>
            )}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={isLoading}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isLoading ? "..." : "Télécharger"}
        </button>
      </div>

      {/* Preview area */}
      <div className="p-4 min-h-[200px] flex items-center justify-center">
        {canPreviewInline ? (
          <div className="w-full max-h-96 overflow-auto bg-[#0c0c10] rounded-lg p-4 font-mono text-xs text-white/60">
            {/* Placeholder for inline content */}
            <p className="text-white/30 italic">Prévisualisation du contenu...</p>
          </div>
        ) : (
          <div className="text-center">
            <span className="text-6xl">{ASSET_ICONS[asset.type]}</span>
            <p className="mt-4 text-sm text-white/40">
              {asset.type === "pdf" && "PDF - Téléchargez pour visualiser"}
              {asset.type === "excel" && "Excel - Téléchargez pour éditer"}
              {asset.type === "doc" && "Document - Téléchargez pour visualiser"}
              {asset.type === "report" && "Rapport - Téléchargez pour visualiser"}
            </p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 border-t border-white/[0.06] bg-white/[0.01]">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-white/40">ID:</span>
            <span className="ml-2 text-white/60 font-mono">{asset.id.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="text-white/40">Run:</span>
            <span className="ml-2 text-white/60 font-mono">{asset.run_id.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="text-white/40">Créé:</span>
            <span className="ml-2 text-white/60">
              {new Date(asset.created_at).toLocaleString()}
            </span>
          </div>
          {(() => {
            const createdBy = asset.metadata?.createdBy;
            if (typeof createdBy === "string") {
              return (
                <div>
                  <span className="text-white/40">Par:</span>
                  <span className="ml-2 text-white/60">{createdBy}</span>
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

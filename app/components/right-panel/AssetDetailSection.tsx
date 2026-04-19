"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetDetail } from "@/lib/runtime/assets/detail-types";

const TYPE_BADGE_COLOR: Record<string, string> = {
  report: "bg-emerald-500/10 text-emerald-400",
  doc: "bg-blue-500/10 text-blue-400",
  text: "bg-zinc-700/50 text-zinc-400",
  json: "bg-amber-500/10 text-amber-400",
  pdf: "bg-red-500/10 text-red-400",
  excel: "bg-green-500/10 text-green-400",
  csv: "bg-green-500/10 text-green-400",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts?: number): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonDetail() {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex animate-pulse items-center gap-2">
        <span className="h-4 w-16 rounded bg-zinc-800/60" />
        <span className="h-3 w-24 rounded bg-zinc-800/40" />
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-zinc-800/30" />
    </div>
  );
}

function TextPreview({ content }: { content: string }) {
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-lg bg-zinc-900/60 p-2.5">
      <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-300">
        {content}
      </pre>
    </div>
  );
}

function JsonPreview({ data }: { data: unknown }) {
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-lg bg-zinc-900/60 p-2.5">
      <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-zinc-400">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

const HIDDEN_META_KEYS = new Set(["content", "_filePath", "_fileName", "_mimeType", "_sizeBytes"]);

function MetadataPreview({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(
    ([k, v]) => v !== undefined && v !== null && !HIDDEN_META_KEYS.has(k),
  );

  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">Metadata</p>
      <div className="rounded-lg bg-zinc-900/40 px-2 py-1.5">
        {entries.slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex items-start gap-1.5 py-0.5">
            <span className="shrink-0 text-[10px] text-zinc-600">{key}:</span>
            <span className="min-w-0 truncate text-[10px] text-zinc-400">
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetDetailSection({
  assetId,
  onClose,
  onOpenSourceRun,
}: {
  assetId: string | null;
  onClose: () => void;
  onOpenSourceRun?: (runId: string) => void;
}) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setAsset(null);
      setNotFound(false);
      fetchedRef.current = null;
      return;
    }

    if (fetchedRef.current === assetId) return;
    fetchedRef.current = assetId;

    setLoading(true);
    setNotFound(false);

    fetch(`/api/v2/assets/${assetId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.asset) {
          setAsset(data.asset);
          setNotFound(false);
        } else {
          setAsset(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        setAsset(null);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [assetId]);

  if (!assetId) return null;

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Asset Detail
        </h3>
        <button
          onClick={onClose}
          className="text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
        >
          Close
        </button>
      </div>

      {loading ? (
        <SkeletonDetail />
      ) : notFound ? (
        <p className="px-2 text-xs text-zinc-600">Asset unavailable</p>
      ) : asset ? (
        <div>
          {/* Header */}
          <div className="mb-2 rounded-lg bg-zinc-900/50 px-2.5 py-2">
            <p className="truncate text-xs font-medium text-zinc-200">{asset.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  TYPE_BADGE_COLOR[asset.type] ?? "bg-zinc-700/50 text-zinc-400"
                }`}
              >
                {asset.type}
              </span>
              {formatDate(asset.createdAt) && (
                <span className="text-[9px] text-zinc-600">{formatDate(asset.createdAt)}</span>
              )}
            </div>
            {asset.runId && onOpenSourceRun && (
              <button
                onClick={() => onOpenSourceRun(asset.runId)}
                className="mt-1 text-[10px] text-cyan-400/70 transition-colors hover:text-cyan-300"
              >
                Open source run →
              </button>
            )}
          </div>

          {/* File info + Download */}
          {asset.file?.hasFile && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-zinc-300">{asset.file.fileName}</p>
                <p className="text-[9px] text-zinc-600">
                  {asset.file.mimeType}
                  {asset.file.sizeBytes != null && (
                    <span> · {formatSize(asset.file.sizeBytes)}</span>
                  )}
                </p>
              </div>
              <a
                href={asset.file.downloadUrl}
                download
                className="ml-2 shrink-0 rounded bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
              >
                Download
              </a>
            </div>
          )}

          {/* Preview */}
          {asset.previewType === "report" || asset.previewType === "document" || asset.previewType === "text" ? (
            asset.content ? (
              <TextPreview content={asset.content} />
            ) : asset.file?.hasFile ? (
              <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
                {asset.file.mimeType === "application/pdf"
                  ? "Preview not available yet — download the PDF"
                  : "Preview not available yet — download the file"}
              </p>
            ) : (
              <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
                Preview not available — content was not stored
              </p>
            )
          ) : asset.previewType === "json" ? (
            asset.json ? (
              <JsonPreview data={asset.json} />
            ) : asset.file?.hasFile ? (
              <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
                Preview not available yet — download the file
              </p>
            ) : (
              <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
                Preview not available
              </p>
            )
          ) : asset.file?.hasFile ? (
            <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
              Preview not available yet — download the file
            </p>
          ) : (
            <p className="rounded-lg bg-zinc-900/30 px-2.5 py-4 text-center text-[11px] text-zinc-600">
              Preview not available yet
            </p>
          )}

          {/* Metadata */}
          {asset.metadata && <MetadataPreview metadata={asset.metadata} />}
        </div>
      ) : null}
    </section>
  );
}

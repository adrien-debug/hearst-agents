"use client";

import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";
import type { MessageAssetRef } from "@/stores/navigation";

const TYPE_LABELS: Record<string, string> = {
  report: "Rapport",
  brief: "Brief",
  doc: "Document",
  document: "Document",
  audio: "Audio",
  video: "Vidéo",
  image: "Image",
  code: "Code",
  synthesis: "Synthèse",
};

function AssetIcon({ type }: { type: string }) {
  if (type === "report" || type === "synthesis") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function ChatAssetCard({ assetRef }: { assetRef: MessageAssetRef }) {
  const setFocal = useFocalStore((s) => s.setFocal);
  const setStageMode = useStageStore((s) => s.setMode);

  const handleOpen = () => {
    if (!assetRef.id || isPlaceholderAssetId(assetRef.id)) return;
    setFocal(assetToFocal({ id: assetRef.id, name: assetRef.title, type: assetRef.type }, null));
    setStageMode({ mode: "asset", assetId: assetRef.id });
  };

  const typeLabel = TYPE_LABELS[assetRef.type.toLowerCase()] ?? assetRef.type.toUpperCase();

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="group flex items-center gap-3 w-full text-left transition-all duration-base"
      style={{
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--border-shell)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-1)",
      }}
    >
      <span
        className="flex items-center justify-center shrink-0 transition-colors duration-base text-[var(--text-faint)] group-hover:text-[var(--cykan)]"
        style={{
          width: "var(--space-9)",
          height: "var(--space-9)",
          borderRadius: "var(--radius-xs)",
          background: "var(--surface-2)",
        }}
      >
        <AssetIcon type={assetRef.type} />
      </span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="t-11 font-light text-[var(--text-faint)] group-hover:text-[var(--cykan)] transition-colors">
          {typeLabel}
        </span>
        <span className="t-13 text-[var(--text)] font-light truncate">
          {assetRef.title}
        </span>
      </div>
      <span className="t-11 font-light text-[var(--text-faint)] group-hover:text-[var(--cykan)] transition-colors shrink-0">
        Ouvrir →
      </span>
    </button>
  );
}

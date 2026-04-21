"use client";

import type { RightPanelAsset } from "@/lib/ui/right-panel/types";

const ASSET_LABEL: Record<string, string> = {
  report: "RPT",
  doc: "DOC",
  pdf: "PDF",
  excel: "XLS",
  json: "JSON",
  text: "TXT",
};

function SkeletonAssets() {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {[1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
      ))}
    </div>
  );
}

export function AssetsSection({
  assets,
  loading,
  error,
  selectedAssetId,
  onAssetSelect,
}: {
  assets: RightPanelAsset[];
  loading: boolean;
  error: boolean;
  selectedAssetId?: string;
  onAssetSelect?: (assetId: string) => void;
}) {
  return (
    <section className="pt-2">
      {loading ? (
        <SkeletonAssets />
      ) : error ? (
        <p className="text-[10px] font-mono text-white/20">Connexion requise</p>
      ) : assets.length === 0 ? (
        <p className="text-[10px] font-mono text-white/15">Aucun fichier généré</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {assets.slice(0, 10).map((asset) => (
            <button
              key={asset.id}
              onClick={() => onAssetSelect?.(asset.id)}
              className={`group relative cursor-pointer rounded-lg bg-white/[0.03] px-3 py-2 text-left transition-colors duration-200 hover:bg-white/[0.05] ${
                selectedAssetId === asset.id
                  ? "bg-white/[0.05] border-l-2 border-cyan-400/30"
                  : "border-l-2 border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[8px] font-mono text-white/35 tracking-wide">
                  {ASSET_LABEL[asset.type] ?? "FIC"}
                </span>
                <p className="min-w-0 flex-1 truncate text-[10px] font-mono text-white/50 group-hover:text-white/65 transition-colors duration-200">
                  {asset.name}
                </p>
                <span className="shrink-0 text-[9px] text-white/0 group-hover:text-white/20 transition-colors duration-200">›</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

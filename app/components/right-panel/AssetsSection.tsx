"use client";

import type { RightPanelAsset } from "@/lib/ui/right-panel/types";

const ASSET_ICON: Record<string, string> = {
  report: "📊",
  doc: "📄",
  pdf: "📕",
  excel: "📗",
  json: "🔧",
  text: "📝",
};

function SkeletonAssets() {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {[1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/3" />
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
        <p className="text-[10px] font-mono text-white/20">Sign in to activate</p>
      ) : assets.length === 0 ? (
        <p className="text-[10px] font-mono text-white/15">No assets generated</p>
      ) : (
        <div className="flex flex-col gap-2">
          {assets.slice(0, 10).map((asset) => (
            <button
              key={asset.id}
              onClick={() => onAssetSelect?.(asset.id)}
              className={`group relative cursor-pointer rounded-xl bg-white/3 px-3 py-2.5 text-left transition-all duration-300 hover:bg-white/6 hover:scale-[1.02] hover:-translate-y-1 ${
                selectedAssetId === asset.id ? "bg-white/6 ring-1 ring-cyan-500/10" : ""
              }`}
            >
              <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex items-center gap-3">
                <span className="text-sm">{ASSET_ICON[asset.type] ?? "📄"}</span>
                <p className="min-w-0 flex-1 truncate text-[11px] font-mono text-white/60 group-hover:text-white/80 transition-colors duration-300">
                  {asset.name}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

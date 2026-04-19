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
    <div className="space-y-2">
      {[1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-2 rounded-lg px-2 py-2">
          <span className="h-4 w-4 rounded bg-zinc-800/60" />
          <span className="h-3 flex-1 rounded bg-zinc-800/60" />
        </div>
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
    <section className="mb-4">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Outputs
      </h3>

      {loading ? (
        <SkeletonAssets />
      ) : error ? (
        <p className="px-2 text-xs text-zinc-600">Sign in to activate</p>
      ) : assets.length === 0 ? (
        <p className="px-2 text-xs text-zinc-600">No assets generated</p>
      ) : (
        <div className="space-y-0.5">
          {assets.slice(0, 10).map((asset) => (
            <button
              key={asset.id}
              onClick={() => onAssetSelect?.(asset.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 ${
                selectedAssetId === asset.id ? "bg-zinc-800/50 ring-1 ring-emerald-500/15" : "hover:bg-zinc-900/30"
              }`}
            >
              <span className="text-xs">{ASSET_ICON[asset.type] ?? "📄"}</span>
              <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">{asset.name}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

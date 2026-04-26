"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeAsset } from "@/lib/engine/runtime/assets/types";
import { toast } from "@/app/hooks/use-toast";
import { GhostIconChevronLeft, GhostIconChevronRight, GhostIconDownload, GhostIconSearch, GhostIconX } from "../components/ghost-icons";

type AssetFilterType = "all" | "report" | "pdf" | "excel" | "doc" | "csv" | "json";

function typeRef(t: string) {
  return t.toUpperCase().slice(0, 6);
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<RuntimeAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<AssetFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 24;

  useEffect(() => {
    async function loadAssets() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          offset: offset.toString(),
          limit: limit.toString(),
        });

        if (activeFilter !== "all") {
          params.set("type", activeFilter);
        }

        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }

        const res = await fetch(`/api/v2/assets?${params.toString()}`);
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to load assets:", res.status, errorText);
          toast.error("Échec du chargement", "Impossible de charger les assets");
          setAssets([]);
          setTotal(0);
          return;
        }

        const data = await res.json();
        setAssets(data.assets || []);
        setTotal(data.pagination?.total || 0);
      } catch (error) {
        console.error("Failed to load assets:", error);
        toast.error("Erreur de chargement", "Une erreur est survenue");
        setAssets([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }

    loadAssets();
  }, [offset, activeFilter, searchQuery]);

  const handleDownload = async (assetId: string, assetName: string) => {
    try {
      const res = await fetch(`/api/v2/assets/${assetId}/download`);
      if (!res.ok) {
        console.error("Download failed:", res.status);
        toast.error("Téléchargement échoué", `Impossible de télécharger ${assetName}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = assetName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Téléchargement réussi", assetName);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Erreur de téléchargement", "Une erreur est survenue");
    }
  };

  const handleAssetClick = (assetId: string) => {
    router.push(`/assets/${assetId}`);
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (loading && assets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8" style={{ background: "var(--bg)" }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30">Loading assets...</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="h-2 bg-white/10 rounded animate-pulse" />
          <div className="h-2 bg-white/10 rounded animate-pulse" />
          <div className="h-2 bg-white/10 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-2">Registry</p>
            <h1 className="text-[22px] font-bold tracking-tight text-white">Assets</h1>
            <p className="text-[11px] font-mono tracking-wide text-white/40 mt-2">{total} items</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0);
              }}
              placeholder="Search assets..."
              className="w-full bg-transparent border-b border-white/10 py-2 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cykan)]"
            />
            <GhostIconSearch className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setOffset(0);
                }}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
                aria-label="Effacer"
              >
                <GhostIconX className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { id: "all", label: "All" },
              { id: "report", label: "Reports" },
              { id: "pdf", label: "PDF" },
              { id: "excel", label: "Excel" },
              { id: "doc", label: "Docs" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.id as AssetFilterType);
                  setOffset(0);
                }}
                className={`text-[11px] font-medium pb-1 border-b-2 transition-colors ${
                  activeFilter === filter.id
                    ? "text-[var(--cykan)] border-[var(--cykan)]"
                    : "text-white/30 border-transparent hover:text-white/50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <GhostIconSearch className="w-8 h-8 text-white/20" />
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30">No results</p>
            <p className="text-[13px] font-normal text-white/40 max-w-md">
              {searchQuery ? `No results for "${searchQuery}"` : activeFilter !== "all" ? `No ${activeFilter} files` : "Awaiting orchestration output."}
            </p>
          </div>
        ) : (
          <>
            <div className="border-t border-white/5">
              <div className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-4 px-4 py-3 text-[10px] font-mono uppercase tracking-[0.1em] text-white/30 border-b border-white/5">
                <span>Name</span>
                <span>Type</span>
                <span>Date</span>
                <span className="text-right">Action</span>
              </div>
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => handleAssetClick(asset.id)}
                  className="w-full grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-4 items-center px-4 py-4 text-left border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{asset.name}</p>
                    <p className="font-mono text-[9px] text-white/30 truncate">{asset.id.slice(0, 10)}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    {typeRef(asset.type)}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {new Date(asset.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(asset.id, asset.name);
                      }}
                      className="inline-flex p-2 text-white/30 hover:text-[var(--cykan)]"
                      aria-label="Télécharger"
                    >
                      <GhostIconDownload className="w-4 h-4" />
                    </button>
                  </span>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-6 mt-8 font-mono text-[11px] text-white/40">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 disabled:opacity-30 hover:text-white"
                >
                  <GhostIconChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <span>
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 disabled:opacity-30 hover:text-white"
                >
                  Next
                  <GhostIconChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeAsset } from "@/lib/engine/runtime/assets/types";
import { toast } from "@/app/hooks/use-toast";
import { GhostIconChevronLeft, GhostIconChevronRight, GhostIconDownload, GhostIconSearch, GhostIconX } from "../components/ghost-icons";

type AssetFilterType = "all" | "report" | "pdf" | "excel" | "doc" | "csv" | "json";

function typeRef(t: string) {
  return `TYPE_${t.toUpperCase().slice(0, 6)}`;
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
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8" style={{ background: "var(--bg)" }}>
        <p className="ghost-meta-label">LOAD_ASSETS</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      <div className="border-b border-[var(--line)] p-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="ghost-meta-label mb-2">REGISTRY</p>
            <h1 className="ghost-title-impact text-xl">Assets</h1>
            <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--text-muted)] mt-2">ROW_COUNT_{total}</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0);
              }}
              placeholder="QUERY_STRING_"
              className="ghost-input-line w-full pr-10"
            />
            <GhostIconSearch className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setOffset(0);
                }}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] p-1"
                aria-label="Effacer"
              >
                <GhostIconX className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "ALL" },
              { id: "report", label: "RPT" },
              { id: "pdf", label: "PDF" },
              { id: "excel", label: "XLS" },
              { id: "doc", label: "DOC" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.id as AssetFilterType);
                  setOffset(0);
                }}
                className={`font-mono text-[9px] uppercase tracking-[0.2em] pb-1 border-b-2 transition-colors ${
                  activeFilter === filter.id
                    ? "text-[var(--cykan)] border-[var(--cykan)]"
                    : "text-[var(--text-faint)] border-transparent hover:text-[var(--text-muted)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-6">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
            <GhostIconSearch className="w-10 h-10 text-[var(--text-faint)]" />
            <p className="ghost-meta-label">EMPTY_RESULT</p>
            <p className="text-[13px] font-light text-[var(--text-muted)] max-w-md">
              {searchQuery ? `NO_HIT_FOR "${searchQuery}"` : activeFilter !== "all" ? `NO_ROWS_${activeFilter}` : "Awaiting orchestration output."}
            </p>
          </div>
        ) : (
          <>
            <div className="border-t border-[var(--line)]">
              <div className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-6 px-4 py-3 text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line)]">
                <span>ID / Name</span>
                <span>Type</span>
                <span>TS</span>
                <span className="text-right">DL</span>
              </div>
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => handleAssetClick(asset.id)}
                  className="w-full grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-6 items-center px-4 py-5 text-left border-b border-[var(--line)] hover:bg-[var(--bg-soft)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] text-[var(--text-faint)] truncate">ID_{asset.id.slice(0, 10)}</p>
                    <p className="text-[13px] font-medium text-[var(--text)] truncate">{asset.name}</p>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)] border-b border-[var(--line-strong)] pb-0.5 self-start mt-1">
                    {typeRef(asset.type)}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] self-start mt-1">
                    {new Date(asset.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex justify-end self-start mt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(asset.id, asset.name);
                      }}
                      className="inline-flex p-2 text-[var(--text-muted)] hover:text-[var(--cykan)]"
                      aria-label="Télécharger"
                    >
                      <GhostIconDownload className="w-4 h-4" />
                    </button>
                  </span>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-6 mt-10 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 disabled:opacity-30 border-b border-transparent hover:border-[var(--line-strong)] pb-0.5"
                >
                  <GhostIconChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <span>
                  PAGE_{currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 disabled:opacity-30 border-b border-transparent hover:border-[var(--line-strong)] pb-0.5"
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

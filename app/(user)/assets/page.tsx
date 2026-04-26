"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AssetPreview } from "../components/AssetPreview";
import type { RuntimeAsset } from "@/lib/engine/runtime/assets/types";

type AssetFilterType = "all" | "report" | "pdf" | "excel" | "doc" | "csv" | "json";

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
        if (!res.ok) throw new Error("Failed to load assets");
        
        const data = await res.json();
        setAssets(data.assets || []);
        setTotal(data.pagination?.total || 0);
      } catch (error) {
        console.error("Failed to load assets:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAssets();
  }, [offset, activeFilter, searchQuery]);

  const handleDownload = async (assetId: string, assetName: string) => {
    try {
      const res = await fetch(`/api/v2/assets/${assetId}/download`);
      if (!res.ok) throw new Error("Download failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = assetName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Échec du téléchargement");
    }
  };

  const handleAssetClick = (assetId: string) => {
    router.push(`/assets/${assetId}`);
  };

  const stats = useMemo(() => {
    return {
      total: assets.length,
      reports: assets.filter((a) => a.type === "report").length,
      pdfs: assets.filter((a) => a.type === "pdf").length,
      excel: assets.filter((a) => a.type === "excel").length,
      docs: assets.filter((a) => a.type === "doc").length,
    };
  }, [assets]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (loading && assets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-[var(--text-muted)] text-sm">Chargement des assets...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-[var(--text)] mb-1">Assets</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {total} document{total !== 1 ? "s" : ""} généré{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0); // Reset to first page on search
              }}
              placeholder="Rechercher un asset..."
              className="w-full bg-white/[0.03] border border-[var(--line)] rounded-lg px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--cykan)]/30"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setOffset(0);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-soft)]"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { id: "all", label: "Tous", count: total },
              { id: "report", label: "Reports", count: stats.reports },
              { id: "pdf", label: "PDF", count: stats.pdfs },
              { id: "excel", label: "Excel", count: stats.excel },
              { id: "doc", label: "Docs", count: stats.docs },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => {
                  setActiveFilter(filter.id as AssetFilterType);
                  setOffset(0);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFilter === filter.id
                    ? "bg-[var(--cykan)]/15 text-[var(--cykan)] border border-[var(--cykan)]/30"
                    : "bg-white/[0.03] text-[var(--text-muted)] border border-[var(--line)] hover:bg-white/[0.05]"
                }`}
              >
                {filter.label}
                <span className="ml-1.5 text-[var(--text-faint)]">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-[var(--line)] flex items-center justify-center mb-4">
              <span className="text-2xl">📄</span>
            </div>
            <h2 className="text-lg font-medium text-[var(--text)] mb-2">Aucun asset trouvé</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              {searchQuery
                ? `Aucun résultat pour "${searchQuery}"`
                : activeFilter !== "all"
                ? `Aucun asset de type "${activeFilter}"`
                : "Les assets générés par l'orchestration apparaîtront ici."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex flex-col rounded-xl bg-white/[0.02] border border-[var(--line)] hover:bg-white/[0.03] transition-colors overflow-hidden cursor-pointer"
                  onClick={() => handleAssetClick(asset.id)}
                >
                  {/* Asset preview header */}
                  <div className="p-4 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">
                        {asset.type === "pdf"
                          ? "📄"
                          : asset.type === "excel"
                          ? "📊"
                          : asset.type === "doc"
                          ? "📝"
                          : "📋"}
                      </span>
                      <span className="text-xs text-[var(--text-faint)] uppercase tracking-wider">
                        {asset.type}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-[var(--text)] line-clamp-2 mb-1">
                      {asset.name}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                      {(asset.metadata?.description as string) || "Aucune description"}
                    </p>
                  </div>

                  {/* Asset metadata */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
                      <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                      {asset.file?.sizeBytes && (
                        <>
                          <span>·</span>
                          <span>{(asset.file.sizeBytes / 1024).toFixed(1)} KB</span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(asset.id, asset.name);
                      }}
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--cykan)] transition-colors"
                      title="Télécharger"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Précédent
                </button>
                <span className="text-sm text-[var(--text-soft)]">
                  Page {currentPage} sur {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Suivant →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

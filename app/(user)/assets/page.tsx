"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  url?: string;
}

export default function AssetsPage() {
  const searchParams = useSearchParams();
  const assetId = searchParams.get("id");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch("/api/v2/assets");
        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets || []);
          
          // Select asset from URL param
          if (assetId) {
            const found = data.assets?.find((a: Asset) => a.id === assetId);
            if (found) setSelectedAsset(found);
          }
        }
      } catch (_err) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    loadAssets();
  }, [assetId]);

  const handleDownload = (asset: Asset, e: React.MouseEvent) => {
    e.preventDefault();
    if (asset.url) {
      window.open(asset.url, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-white/30 font-mono text-[11px] uppercase tracking-widest">
          Loading assets...
        </div>
      </div>
    );
  }

  if (selectedAsset) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#080808] to-[#060606]">
        <div className="p-6 border-b border-white/[0.05] flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">{selectedAsset.name}</h1>
            <p className="text-[11px] font-mono text-white/40 uppercase mt-1">{selectedAsset.type} · {(selectedAsset.size / 1024).toFixed(1)} KB</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedAsset.url && (
              <a
                href={selectedAsset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[var(--cykan)] text-black text-[12px] font-medium rounded-sm hover:opacity-90 transition-opacity"
              >
                Download
              </a>
            )}
            <Link
              href="/assets"
              className="px-4 py-2 border border-white/20 text-white/70 text-[12px] font-medium rounded-sm hover:bg-white/5 transition-colors"
            >
              Back
            </Link>
          </div>
        </div>
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-8">
              <p className="text-[14px] text-white/60">Asset details view</p>
              <p className="text-[12px] font-mono text-white/40 mt-4">ID: {selectedAsset.id}</p>
              <p className="text-[12px] font-mono text-white/40">Created: {new Date(selectedAsset.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#080808] to-[#060606]">
      <div className="p-6 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">Assets</h1>
            <p className="text-[11px] font-mono text-white/40 uppercase mt-1 tracking-wide">
              {assets.length} files stored
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {assets.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[14px] text-white/40">No assets found</p>
            </div>
          ) : (
            <div className="border border-white/[0.05] rounded-sm overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-4 items-center px-4 py-3 bg-white/[0.02] border-b border-white/[0.05] text-[10px] font-mono uppercase tracking-wider text-white/40">
                <span>Name</span>
                <span className="text-right">Type</span>
                <span className="text-right">Size</span>
                <span className="text-right">Actions</span>
              </div>
              
              {assets.map((asset, index) => (
                <div
                  key={asset.id}
                  className={`grid grid-cols-[minmax(0,1.2fr)_auto_auto_auto] gap-x-4 items-center px-4 py-4 hover:bg-white/[0.02] transition-colors ${index !== assets.length - 1 ? 'border-b border-white/[0.03]' : ''}`}
                >
                  <Link
                    href={`/assets?id=${asset.id}`}
                    className="text-[13px] text-white/80 hover:text-white truncate"
                  >
                    {asset.name}
                  </Link>
                  <span className="text-[11px] font-mono text-white/40 uppercase text-right">
                    {asset.type}
                  </span>
                  <span className="text-[11px] font-mono text-white/40 text-right">
                    {(asset.size / 1024).toFixed(1)} KB
                  </span>
                  <div className="flex justify-end gap-2">
                    {asset.url && (
                      <button
                        type="button"
                        onClick={(e) => handleDownload(asset, e)}
                        className="p-2 text-white/30 hover:text-[var(--cykan)] transition-colors"
                        aria-label="Download"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </button>
                    )}
                    <Link
                      href={`/assets?id=${asset.id}`}
                      className="p-2 text-white/30 hover:text-white transition-colors"
                      aria-label="View details"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

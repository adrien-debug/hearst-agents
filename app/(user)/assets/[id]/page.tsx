"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AssetPreview } from "../../components/AssetPreview";
import type { Asset } from "@/lib/engine/runtime/assets/types";

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAsset() {
      try {
        const res = await fetch(`/api/v2/assets/${assetId}`);
        if (!res.ok) throw new Error("Failed to load asset");
        const data = await res.json();
        setAsset(data.asset);
      } catch (error) {
        console.error("Failed to load asset:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAsset();
  }, [assetId]);

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/v2/assets/${assetId}/download`);
      if (!res.ok) throw new Error("Download failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset?.name || "download";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Échec du téléchargement");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 text-sm">Chargement...</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-white/40 text-sm mb-4">Asset non trouvé</div>
        <button
          onClick={() => router.push("/")}
          className="text-cyan-400 hover:text-cyan-300 text-sm"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => router.back()}
            className="text-white/40 hover:text-white/60 text-sm"
          >
            ← Retour
          </button>
        </div>
        <h1 className="text-xl font-medium text-white">Asset</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <AssetPreview asset={asset} onDownload={handleDownload} />
        </div>
      </div>
    </div>
  );
}

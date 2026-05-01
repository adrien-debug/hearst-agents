"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AssetPreview } from "../../components/AssetPreview";
import type { Asset } from "@/lib/assets/types";
import { toast } from "@/app/hooks/use-toast";
import { PageHeader } from "../../components/PageHeader";

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
      if (!res.ok) {
        console.error("Download failed:", res.status);
        toast.error("Téléchargement échoué", `Impossible de télécharger ${asset?.title || "l'asset"}`);
        return;
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset?.title || "download";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Téléchargement réussi", asset?.title || "Asset téléchargé");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Erreur de téléchargement", "Une erreur est survenue");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="t-13 text-[var(--text-faint)]">Chargement…</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="t-13 text-[var(--text-ghost)] mb-4">Asset non trouvé</div>
        <button
          onClick={() => router.push("/")}
          className="t-13 text-[var(--cykan)] hover:text-[var(--cykan)]/80"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-elev)" }}>
      <PageHeader
        title={asset.title || "Asset"}
        subtitle={asset.kind ? asset.kind.toUpperCase() : undefined}
        back={{ label: "Retour aux assets", href: "/assets" }}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <AssetPreview asset={asset} onDownload={handleDownload} />
        </div>
      </div>
    </div>
  );
}

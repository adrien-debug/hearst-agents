"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStageStore } from "@/stores/stage";
import { Breadcrumb, type Crumb } from "../components/Breadcrumb";
import { RelativeTime } from "../components/RelativeTime";
import { toast } from "@/app/hooks/use-toast";

// Format V2 retourné par GET /api/v2/assets (Asset canonique).
interface AssetListItem {
  id: string;
  title: string;
  kind: string;
  createdAt: number;
  contentRef?: string;
  provenance?: {
    pdfFile?: { sizeBytes?: number };
  };
}

const TYPE_GLYPH: Record<string, string> = {
  report: "▦",
  brief: "≡",
  message: "✉",
  document: "▤",
  doc: "▤",
  synthesis: "◇",
  plan: "◈",
};

function glyph(type: string): string {
  return TYPE_GLYPH[type.toLowerCase()] || "·";
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch("/api/v2/assets");
        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets || []);
        }
      } catch (_err) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    loadAssets();
  }, []);

  const handleOpen = (asset: AssetListItem) => {
    // Cohérence avec AssetsGrid (rail droit) post-pivot 2026-04-29 :
    // useStageStore.setMode → AssetStage standalone qui hydrate l'asset
    // via fetch /api/v2/assets/[id]. Le router.push("/") ramène sur la
    // home où le Stage polymorphe est rendu.
    useStageStore.getState().setMode({ mode: "asset", assetId: asset.id });
    router.push("/");
  };

  const handleDownload = (asset: AssetListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/v2/assets/${encodeURIComponent(asset.id)}/download`, "_blank");
  };

  const handleDelete = async (asset: AssetListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer "${asset.title}" ? Cette action est irréversible.`)) return;
    try {
      const res = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        toast.success("Asset supprimé", asset.title);
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.error("Suppression impossible", data.error ?? `Erreur serveur (${res.status})`);
    } catch (err) {
      toast.error(
        "Erreur de suppression",
        err instanceof Error ? err.message : "Erreur réseau",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="t-11 font-mono tracking-marquee uppercase text-[var(--text-faint)] animate-pulse">
          Chargement des assets…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--surface-2)] p-6">
        <Breadcrumb trail={[{ label: "Hearst", href: "/" }, { label: "Assets" }] as Crumb[]} className="mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ghost-title-impact mb-1">Assets</h1>
            <p className="t-11 font-mono uppercase tracking-display text-[var(--text-muted)]">
              {assets.length} {assets.length === 1 ? "fichier" : "fichiers"} stocké{assets.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
              <p className="t-9 font-mono tracking-marquee uppercase text-[var(--text-faint)]">Registre vide</p>
              <p className="t-13 text-[var(--text-muted)] max-w-md leading-relaxed">
                Aucun asset pour l&apos;instant. Les rapports, briefs et documents générés par tes runs apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="border-y border-[var(--surface-2)]">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 px-2 py-3 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] border-b border-[var(--surface-2)]">
                <span className="w-4" />
                <span>Name</span>
                <span className="text-right">Type</span>
                <span className="text-right">Size</span>
                <span className="text-right">Created</span>
                <span aria-hidden />
                <span aria-hidden />
              </div>

              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleOpen(asset)}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 items-center px-2 py-4 hover:bg-[var(--surface-1)] transition-colors border-b border-[var(--surface-2)] group cursor-pointer"
                  title={`Open ${asset.title}`}
                >
                  <span className="t-15 text-[var(--cykan)] opacity-40 group-hover:opacity-100 transition-opacity leading-none w-4 text-center">
                    {glyph(asset.kind)}
                  </span>
                  <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors truncate">
                    {asset.title}
                  </span>
                  <span className="t-9 font-mono tracking-display text-[var(--text-faint)] uppercase text-right">
                    {asset.kind}
                  </span>
                  <span className="t-9 font-mono text-[var(--text-faint)] text-right">
                    {asset.provenance?.pdfFile?.sizeBytes
                      ? `${(asset.provenance.pdfFile.sizeBytes / 1024).toFixed(1)} KB`
                      : "—"}
                  </span>
                  <RelativeTime
                    ts={asset.createdAt}
                    className="t-9 font-mono tracking-display text-[var(--text-ghost)] uppercase text-right"
                  />
                  <button
                    type="button"
                    onClick={(e) => handleDownload(asset, e)}
                    disabled={!asset.provenance?.pdfFile}
                    className="t-9 font-mono tracking-display uppercase text-[var(--text-ghost)] hover:text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                  >
                    Télécharger
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(asset, e)}
                    className="t-9 font-mono tracking-display uppercase text-[var(--text-ghost)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-all"
                    title={`Supprimer ${asset.title}`}
                    aria-label={`Supprimer ${asset.title}`}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

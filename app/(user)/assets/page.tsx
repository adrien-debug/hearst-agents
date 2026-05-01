"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { RelativeTime } from "../components/RelativeTime";
import { toast } from "@/app/hooks/use-toast";
import { PageHeader } from "../components/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { Action } from "../components/ui";

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
  const addThread = useNavigationStore((s) => s.addThread);
  const setStageMode = useStageStore((s) => s.setMode);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<AssetListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleNewAsset = () => {
    const id = addThread("Nouvel asset", "home");
    setStageMode({ mode: "chat", threadId: id });
    router.push("/");
  };

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

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const asset = confirmDelete;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        toast.success("Asset supprimé", asset.title);
        setConfirmDelete(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.error("Suppression impossible", data.error ?? `Erreur serveur (${res.status})`);
    } catch (err) {
      toast.error(
        "Erreur de suppression",
        err instanceof Error ? err.message : "Erreur réseau",
      );
    } finally {
      setIsDeleting(false);
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
      <PageHeader
        title="Assets"
        subtitle={`${assets.length} ${assets.length === 1 ? "fichier stocké" : "fichiers stockés"}`}
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Assets" }]}
        actions={
          <Action variant="link" tone="brand" onClick={handleNewAsset}>
            Nouvel asset
          </Action>
        }
      />

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
            <div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 px-2 py-3 t-11 font-medium text-[var(--text-l1)] border-b border-[var(--border-soft)]">
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
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 items-center px-2 py-4 border-b border-[var(--border-soft)] group cursor-pointer transition-colors"
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(asset);
                    }}
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

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer cet asset ?"
        description={confirmDelete ? `« ${confirmDelete.title} » sera supprimé définitivement. Cette action est irréversible.` : undefined}
        confirmLabel="Supprimer"
        variant="danger"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

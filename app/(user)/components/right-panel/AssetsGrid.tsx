"use client";

/**
 * AssetsGrid — grille 2 colonnes V05 : chaque asset = mini-card avec
 * micro-chart vectoriel (line/bars/scatter/bands selon type).
 *
 * Click → setFocal(assetToFocal). Suppression au hover → DELETE puis
 * optimistic state update (rollback en cas d'erreur).
 */

import { useState } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { useFocalStore } from "@/stores/focal";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { toast } from "@/app/hooks/use-toast";
import { AssetGlyphSVG } from "../right-panel-helpers";
import { AssetMiniChart } from "./AssetMiniChart";

interface AssetsGridProps {
  assets: RightPanelData["assets"];
  activeThreadId: string | null;
  loading: boolean;
}

function assetAccent(type: string): string {
  const t = type.toLowerCase();
  if (t === "brief") return "var(--cykan)";
  if (t === "report" || t === "document" || t === "doc") return "var(--text-muted)";
  if (t === "synthesis") return "var(--warn)";
  if (t === "plan") return "var(--color-success)";
  return "var(--text-faint)";
}

export function AssetsGrid({ assets, activeThreadId, loading }: AssetsGridProps) {
  // Optimistic delete : on cache localement les ids supprimés en attendant
  // le refresh SSE. Pas de mutation directe de la prop `assets`.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  const visibleAssets = assets.filter((a) => !pendingDeletes.has(a.id));

  if (loading && visibleAssets.length === 0) {
    return (
      <div className="px-4 py-8 t-9 font-mono uppercase tracking-[0.22em] text-[var(--text-ghost)] text-center">
        Chargement…
      </div>
    );
  }

  if (visibleAssets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4">
        <span className="w-12 h-12 text-[var(--text-faint)]" style={{ opacity: 0.3 }} aria-hidden>
          <AssetGlyphSVG type="brief" />
        </span>
        <p className="t-11 text-[var(--text-faint)] text-center">
          Aucun asset.
          <br />
          Les livrables apparaîtront ici.
        </p>
      </div>
    );
  }

  const handleDelete = async (asset: RightPanelData["assets"][number]) => {
    if (!window.confirm(`Supprimer "${asset.name}" ?`)) return;
    setPendingDeletes((prev) => new Set(prev).add(asset.id));
    try {
      const res = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success("Asset supprimé", asset.name);
    } catch (err) {
      // Rollback
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
      toast.error("Suppression impossible", err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-3">
      {visibleAssets.map((asset) => {
        const accent = assetAccent(asset.type);
        return (
          <div key={asset.id} className="relative group">
            <button
              type="button"
              onClick={() => useFocalStore.getState().setFocal(assetToFocal(asset, activeThreadId))}
              className="halo-asset-card w-full text-left"
              title={asset.name}
            >
              <div className="flex items-center justify-between px-2 pt-2">
                <span
                  className="t-9 font-mono uppercase tracking-[0.22em]"
                  style={{ color: accent }}
                >
                  {asset.type}
                </span>
                <span className="w-4 h-4" style={{ color: accent }} aria-hidden>
                  <AssetGlyphSVG type={asset.type} />
                </span>
              </div>
              <div className="px-2 py-1.5 flex items-center justify-center">
                <AssetMiniChart type={asset.type} seed={asset.name} />
              </div>
              <div className="px-2 pb-2">
                <p
                  className="t-11 text-[var(--text-soft)] leading-snug"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {asset.name}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(asset);
              }}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all rounded-sm bg-[var(--bg-rail)]"
              title="Supprimer"
              aria-label={`Supprimer ${asset.name}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

"use client";

/**
 * AssetsGrid — grille 2 colonnes V05 : chaque asset = mini-card avec
 * micro-chart vectoriel (line/bars/scatter/bands selon type).
 *
 * Click → useStageStore.setMode({ mode: "asset", assetId }) (post-pivot).
 * Avant le pivot, c'était setFocal(assetToFocal) — mais en mode Cockpit
 * le FocalStage n'est plus rendu, donc le setFocal ne s'affichait pas.
 * Suppression au hover → DELETE puis optimistic state update (rollback
 * en cas d'erreur).
 */

import { useState } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { toast } from "@/app/hooks/use-toast";
import { AssetGlyphSVG } from "../right-panel-helpers";
import { AssetMiniChart } from "./AssetMiniChart";

interface AssetsGridProps {
  assets: RightPanelData["assets"];
  reportSuggestions?: RightPanelData["reportSuggestions"];
  activeThreadId: string | null;
  loading: boolean;
  runningSpecs: Set<string>;
  onRunSuggestion: (specId: string, title: string) => Promise<void>;
}

function AssetSkeleton() {
  return (
    <div
      className="w-full text-left rounded-xl animate-pulse flex flex-col items-center gap-2"
    >
      <div
        className="w-full aspect-square rounded-xl bg-[var(--surface-1)] border border-[var(--border-soft)]"
      />
      <div
        className="w-3/4 h-3 rounded-sm bg-[var(--surface-2)]"
      />
    </div>
  );
}

function SuggestionSkeleton() {
  return (
    <div
      className="w-full flex flex-col animate-pulse rounded-md border border-[var(--border-soft)] bg-[var(--surface-1)]"
      style={{
        padding: "var(--space-3) var(--space-4)",
        gap: "var(--space-2)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="h-4 rounded-sm bg-[var(--surface-2)]"
          style={{ width: "60%" }}
        />
        <div
          className="h-3 rounded-sm bg-[var(--surface-2)]"
          style={{ width: "20%" }}
        />
      </div>
      <div
        className="h-3 rounded-sm bg-[var(--surface-2)]"
        style={{
          width: "90%",
          marginTop: "var(--space-1)",
        }}
      />
    </div>
  );
}

function AssetsSkeletonGrid() {
  return (
    <div
      className="grid grid-cols-3 gap-3"
      style={{ padding: "var(--space-4)" }}
    >
      <AssetSkeleton />
      <AssetSkeleton />
      <AssetSkeleton />
      <AssetSkeleton />
      <AssetSkeleton />
      <AssetSkeleton />
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="animate-spin"
      style={{ animationDuration: "1s" }}
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="var(--cykan)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="20 44"
        transform="rotate(-90 16 16)"
        style={{ filter: "drop-shadow(0 0 3px var(--cykan))" }}
      />
    </svg>
  );
}

function assetAccent(type: string): string {
  const t = type.toLowerCase();
  if (t === "brief") return "var(--cykan)";
  if (t === "report" || t === "document" || t === "doc") return "var(--text-muted)";
  if (t === "synthesis") return "var(--warn)";
  if (t === "plan") return "var(--color-success)";
  return "var(--text-faint)";
}

export function AssetsGrid({
  assets,
  reportSuggestions,
  loading,
  runningSpecs,
  onRunSuggestion,
}: AssetsGridProps) {
  // Optimistic delete : on cache localement les ids supprimés en attendant
  // le refresh SSE. Pas de mutation directe de la prop `assets`.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Connect to focal store to highlight the active asset
  const focal = useFocalStore((s) => s.focal);
  const activeAssetId = focal?.sourceAssetId ?? null;

  const visibleAssets = assets.filter((a) => !pendingDeletes.has(a.id));
  const visibleSuggestions = (reportSuggestions ?? []).filter(
    (s) => !runningSpecs.has(s.specId),
  );

  if (loading && visibleAssets.length === 0) {
    return (
      <div className="flex flex-col">
        <AssetsSkeletonGrid />
      </div>
    );
  }

  if (visibleAssets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4">
        <span className="w-12 h-12 text-[var(--text-ghost)]" aria-hidden>
          <AssetGlyphSVG type="brief" />
        </span>
        <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] text-center font-light">
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
    <div className="flex flex-col">
      <div className="grid grid-cols-3 gap-3" style={{ padding: "var(--space-4)" }}>
        {visibleAssets.map((asset) => {
        const accent = assetAccent(asset.type);
        const isActive = activeAssetId === asset.id;
        const shortTitle = asset.name ? asset.name.split(' ')[0] : "Asset";

        return (
          <div key={asset.id} className="relative group">
            <button
              type="button"
              onClick={() => useStageStore.getState().setMode({ mode: "asset", assetId: asset.id })}
              className="group flex flex-col items-center gap-2 cursor-pointer w-full"
              title={asset.name}
              data-active={isActive}
            >
              <div className={`w-full aspect-square flex flex-col items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden ${isActive ? "halo-cyan-sm" : "group-hover:halo-cyan-sm"}`}>
                <span className={`transition-all duration-300 scale-150 ${isActive ? "opacity-100 text-[var(--cykan)]" : "opacity-40 group-hover:opacity-100 group-hover:text-[var(--cykan)]"}`}>
                  <AssetGlyphSVG type={asset.type} />
                </span>
              </div>
              <div className="flex flex-col items-center w-full">
                <span className={`t-11 font-light truncate w-full text-center transition-colors duration-300 ${isActive ? "text-[var(--text-soft)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-soft)]"}`}>
                  {shortTitle}
                </span>
                <span className="t-9 text-[var(--text-ghost)] tracking-body mt-0.5">
                  {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(asset);
              }}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all rounded-md bg-[var(--surface-2)] backdrop-blur-sm border border-[var(--border-subtle)]"
              title="Supprimer"
              aria-label={`Supprimer ${asset.name}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}

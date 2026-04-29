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
      className="halo-asset-card w-full text-left rounded-sm animate-pulse"
      style={{
        background: "var(--card-flat-bg)",
        border: "1px solid var(--card-flat-border)",
      }}
    >
      <div className="flex items-center justify-between px-2 pt-2">
        <div
          className="h-3 rounded-sm"
          style={{
            background: "var(--surface-1)",
            width: "40%",
          }}
        />
        <div
          className="w-4 h-4 rounded-sm"
          style={{ background: "var(--surface-1)" }}
        />
      </div>
      <div className="px-2 py-2 flex items-center justify-center">
        <div
          style={{
            width: "var(--width-mini-chart)",
            height: "var(--space-10)",
            background: "var(--surface-1)",
            borderRadius: "var(--radius-xs)",
          }}
        />
      </div>
      <div className="px-2 pb-2 flex flex-col gap-1">
        <div
          className="h-3 rounded-sm"
          style={{
            background: "var(--surface-1)",
            width: "80%",
          }}
        />
        <div
          className="h-3 rounded-sm"
          style={{
            background: "var(--surface-1)",
            width: "60%",
          }}
        />
      </div>
    </div>
  );
}

function SuggestionSkeleton() {
  return (
    <div
      className="w-full flex flex-col animate-pulse"
      style={{
        padding: "var(--space-3)",
        gap: "var(--space-1)",
        borderLeft: "2px solid var(--card-flat-border)",
        background: "var(--card-flat-bg)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="h-4 rounded-sm"
          style={{
            background: "var(--surface-1)",
            width: "60%",
          }}
        />
        <div
          className="h-3 rounded-sm"
          style={{
            background: "var(--surface-1)",
            width: "20%",
          }}
        />
      </div>
      <div
        className="h-3 rounded-sm"
        style={{
          background: "var(--surface-1)",
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
      className="grid grid-cols-2 gap-2"
      style={{ padding: "var(--space-3)" }}
    >
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

  if (loading && visibleAssets.length === 0 && visibleSuggestions.length === 0) {
    return (
      <div className="flex flex-col">
        {reportSuggestions && reportSuggestions.length > 0 && (
          <div
            className="flex flex-col"
            style={{
              paddingLeft: "var(--space-3)",
              paddingRight: "var(--space-3)",
              paddingTop: "var(--space-3)",
              gap: "var(--space-2)",
            }}
          >
            <div
              className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]"
              style={{ paddingBottom: "var(--space-1)" }}
            >
              Reports suggérés
            </div>
            <SuggestionSkeleton />
            <SuggestionSkeleton />
          </div>
        )}
        <AssetsSkeletonGrid />
      </div>
    );
  }

  if (visibleAssets.length === 0 && visibleSuggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4">
        <span className="w-12 h-12 text-[var(--text-faint)] opacity-30" aria-hidden>
          <AssetGlyphSVG type="brief" />
        </span>
        <p className="t-11 font-mono uppercase tracking-display text-[var(--text-faint)] text-center">
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
      {visibleSuggestions.length > 0 && (
        <div className="flex flex-col" style={{ paddingLeft: "var(--space-3)", paddingRight: "var(--space-3)", paddingTop: "var(--space-3)", gap: "var(--space-2)" }}>
          <div
            className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]"
            style={{ paddingBottom: "var(--space-1)" }}
          >
            Reports suggérés
          </div>
          {visibleSuggestions.map((s) => {
            const isRunning = runningSpecs.has(s.specId);
            return (
              <button
                key={s.specId}
                type="button"
                onClick={() => !isRunning && onRunSuggestion(s.specId, s.title)}
                disabled={isRunning}
                className={`halo-asset-card w-full text-left flex flex-col ${isRunning ? "opacity-70" : ""}`}
                data-testid={`report-suggestion-${s.specId}`}
                data-suggestion-status={isRunning ? "running" : s.status}
                style={{
                  padding: "var(--space-3)",
                  gap: "var(--space-1)",
                  borderLeft: "2px solid var(--cykan)",
                }}
                title={s.description}
              >
                <div className="flex items-center justify-between">
                  <span className="t-11 text-[var(--text-soft)] font-medium">{s.title}</span>
                  <span
                    className="t-9 font-mono uppercase tracking-marquee inline-flex items-center gap-1.5"
                    style={{
                      color: isRunning ? "var(--cykan)" : s.status === "ready" ? "var(--cykan)" : "var(--text-faint)",
                    }}
                  >
                    {isRunning ? (
                      <>
                        <Spinner size={12} />
                        <span>Génération…</span>
                      </>
                    ) : s.status === "ready" ? (
                      "lancer"
                    ) : (
                      `${s.requiredApps.length - s.missingApps.length}/${s.requiredApps.length}`
                    )}
                  </span>
                </div>
                <span className="t-9 text-[var(--text-faint)]" style={{ lineHeight: 1.4 }}>
                  {s.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2" style={{ padding: "var(--space-3)" }}>
        {visibleAssets.map((asset) => {
        const accent = assetAccent(asset.type);
        const isActive = activeAssetId === asset.id;
        return (
          <div key={asset.id} className="relative group">
            <button
              type="button"
              onClick={() => useStageStore.getState().setMode({ mode: "asset", assetId: asset.id })}
              className={`halo-asset-card w-full text-left rounded-sm ${isActive ? "halo-asset-card--active" : ""}`}
              title={asset.name}
              data-active={isActive}
            >
              <div className="flex items-center justify-between px-2 pt-2">
                <span
                  className="t-9 font-mono uppercase tracking-section"
                  style={{ color: accent }}
                >
                  {asset.type}
                </span>
                <span className="w-4 h-4" style={{ color: accent }} aria-hidden>
                  <AssetGlyphSVG type={asset.type} />
                </span>
              </div>
              <div className="px-2 py-2 flex items-center justify-center">
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
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all rounded-sm bg-[var(--bg-rail)]"
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
    </div>
  );
}

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
      className="w-full text-left rounded-xl animate-pulse flex flex-col justify-between aspect-square p-4"
      style={{
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-start justify-between w-full">
        <div
          className="w-8 h-8 rounded-full"
          style={{ background: "rgba(255,255,255,0.03)" }}
        />
        <div
          className="w-8 h-3 rounded-sm mt-2"
          style={{ background: "rgba(255,255,255,0.03)" }}
        />
      </div>
      <div className="flex-1 flex items-center justify-center py-2">
        <div
          style={{
            width: "var(--width-mini-chart)",
            height: "var(--space-10)",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "var(--radius-xs)",
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        <div
          className="h-3 rounded-sm"
          style={{
            background: "rgba(255,255,255,0.03)",
            width: "80%",
          }}
        />
        <div
          className="h-3 rounded-sm"
          style={{
            background: "rgba(255,255,255,0.03)",
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
      className="w-full flex flex-col animate-pulse rounded-md"
      style={{
        padding: "var(--space-3) var(--space-4)",
        gap: "var(--space-2)",
        border: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="h-4 rounded-sm"
          style={{
            background: "rgba(255,255,255,0.03)",
            width: "60%",
          }}
        />
        <div
          className="h-3 rounded-sm"
          style={{
            background: "rgba(255,255,255,0.03)",
            width: "20%",
          }}
        />
      </div>
      <div
        className="h-3 rounded-sm"
        style={{
          background: "rgba(255,255,255,0.03)",
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
        <span className="w-12 h-12 text-[rgba(255,255,255,0.1)]" aria-hidden>
          <AssetGlyphSVG type="brief" />
        </span>
        <p className="t-10 tracking-[0.15em] uppercase text-[rgba(255,255,255,0.3)] text-center font-light">
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
        <div className="flex flex-col" style={{ paddingLeft: "var(--space-4)", paddingRight: "var(--space-4)", paddingTop: "var(--space-4)", gap: "var(--space-3)" }}>
          <div
            className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.4)]"
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
                className={`w-full text-left flex flex-col rounded-md border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)] focus-visible:outline-none focus-visible:border-[rgba(45,212,191,0.3)] transition-all duration-300 ${isRunning ? "opacity-70" : ""}`}
                data-testid={`report-suggestion-${s.specId}`}
                data-suggestion-status={isRunning ? "running" : s.status}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  gap: "var(--space-2)",
                  background: "rgba(255,255,255,0.015)",
                }}
                title={s.description}
              >
                <div className="flex items-center justify-between">
                  <span className="t-13 font-light text-[rgba(255,255,255,0.9)]">{s.title}</span>
                  <span
                    className="t-9 tracking-[0.2em] uppercase inline-flex items-center gap-2"
                    style={{
                      color: isRunning ? "var(--cykan)" : s.status === "ready" ? "var(--cykan)" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {isRunning ? (
                      <>
                        <Spinner size={12} />
                        <span>GÉNÉRATION…</span>
                      </>
                    ) : s.status === "ready" ? (
                      "LANCER"
                    ) : (
                      `${s.requiredApps.length - s.missingApps.length}/${s.requiredApps.length}`
                    )}
                  </span>
                </div>
                <span className="t-10 text-[rgba(255,255,255,0.4)] tracking-wide" style={{ lineHeight: 1.4 }}>
                  {s.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3" style={{ padding: "var(--space-4)" }}>
        {visibleAssets.map((asset) => {
        const accent = assetAccent(asset.type);
        const isActive = activeAssetId === asset.id;
        return (
          <div key={asset.id} className="relative group">
            <button
              type="button"
              onClick={() => useStageStore.getState().setMode({ mode: "asset", assetId: asset.id })}
              className={`group relative flex flex-col justify-between aspect-square p-4 cursor-pointer rounded-xl transition-all duration-500 overflow-hidden text-left w-full ${
                isActive 
                  ? "bg-[rgba(45,212,191,0.05)] border border-[rgba(45,212,191,0.3)] shadow-[0_0_20px_rgba(45,212,191,0.1)]" 
                  : "bg-[rgba(255,255,255,0.015)] border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(45,212,191,0.3)] hover:shadow-[0_0_20px_rgba(45,212,191,0.05)]"
              }`}
              title={asset.name}
              data-active={isActive}
            >
              <div className="flex items-start justify-between w-full">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-500 ${isActive ? "bg-[rgba(45,212,191,0.1)] text-[var(--cykan)]" : "bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.6)] group-hover:bg-[rgba(45,212,191,0.1)] group-hover:text-[var(--cykan)]"}`}>
                  <span className="w-4 h-4 flex items-center justify-center">
                    <AssetGlyphSVG type={asset.type} />
                  </span>
                </div>
                <span className={`t-9 tracking-[0.2em] uppercase transition-colors duration-500 ${isActive ? "text-[var(--cykan)]" : "text-[rgba(255,255,255,0.3)] group-hover:text-[var(--cykan)]"}`}>
                  {asset.type}
                </span>
              </div>
              
              <div className="flex-1 flex items-center justify-center py-2 opacity-40 group-hover:opacity-80 transition-opacity duration-500">
                <AssetMiniChart type={asset.type} seed={asset.name} />
              </div>

              <div className="flex flex-col gap-1 w-full">
                <span className={`t-13 font-light line-clamp-2 leading-snug transition-colors duration-500 ${isActive ? "text-[rgba(255,255,255,0.9)]" : "text-[rgba(255,255,255,0.7)] group-hover:text-[rgba(255,255,255,0.9)]"}`}>
                  {asset.name}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(asset);
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[var(--danger)] transition-all rounded-md bg-[rgba(255,255,255,0.05)] backdrop-blur-sm border border-[rgba(255,255,255,0.1)]"
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

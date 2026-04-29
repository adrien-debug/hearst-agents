"use client";

/**
 * GeneralDashboard — Vue d'accueil par défaut du RightPanel.
 *
 * Structure FIXE : 3 sections toujours rendues (Missions / Livrables / Alertes).
 * Vide → empty state interne, jamais de bloc escamoté.
 */

import type { RightPanelData } from "@/lib/core/types";
import { useRuntimeStore } from "@/stores/runtime";
import { AssetGlyphSVG } from "../right-panel-helpers";

interface GeneralDashboardProps {
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  onViewChange: (view: "reports" | "missions" | "assets") => void;
  activeThreadId: string | null;
  loading: boolean;
}

function SectionTitle({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="rail-section-label inline-flex items-baseline gap-2">
        <span>{children}</span>
        {typeof count === "number" && (
          <span className="t-9 font-mono tracking-display text-[var(--text-faint)]">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 font-mono uppercase tracking-section text-[var(--cykan)] hover:underline"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center p-3 bg-[var(--card-flat-bg)] border border-dashed border-[var(--card-flat-border)]">
      <span className="t-11 font-mono uppercase text-[var(--text-faint)]">
        {children}
      </span>
    </div>
  );
}

function SkeletonRow({ height = 60 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-[var(--surface-1)] rounded-xs"
      style={{ height: `${height}px` }}
    />
  );
}

function AssetTile({ asset, onClick }: { asset: RightPanelData["assets"][0]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-24 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-base hover:border-[var(--cykan)] hover:bg-[var(--surface-2)]"
      style={{
        boxShadow: "var(--shadow-tile-inset), var(--shadow-tile-base)",
      }}
      title={asset.name}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-tile-inset), var(--shadow-tile-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-tile-inset), var(--shadow-tile-base)";
      }}
    >
      <span className="t-13 text-[var(--text-muted)] group-hover:text-[var(--cykan)] transition-colors">
        <AssetGlyphSVG type={asset.type} />
      </span>
      <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)] group-hover:text-[var(--text-soft)] text-center leading-tight truncate w-full px-0.5">
        {asset.type}
      </span>
    </button>
  );
}

export function GeneralDashboard({
  assets,
  missions,
  onViewChange,
  activeThreadId: _activeThreadId,
  loading,
}: GeneralDashboardProps) {
  const events = useRuntimeStore((s) => s.events);

  const recentAssets = assets.slice(0, 3);
  const activeMissions = missions
    .filter((m) => m.opsStatus === "running" || m.enabled)
    .slice(0, 2);
  const alerts = events
    .filter((e) => ["approval_requested", "run_failed", "email_received"].includes(e.type))
    .slice(0, 2);

  return (
    <div className="flex flex-col p-3 gap-4">
      {/* Section 1 — Missions actives */}
      <section className="rail-section-card">
        <SectionTitle
          count={activeMissions.length}
          action={{ label: "Toutes", onClick: () => onViewChange("missions") }}
        >
          Missions actives
        </SectionTitle>
        <div className="flex flex-col gap-2">
          {loading && activeMissions.length === 0 ? (
            <SkeletonRow height={40} />
          ) : activeMissions.length === 0 ? (
            <EmptyRow>Aucune mission armée.</EmptyRow>
          ) : (
            activeMissions.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 px-3 bg-[var(--card-flat-bg)]"
                style={{
                  borderLeft:
                    m.opsStatus === "running"
                      ? "2px solid var(--cykan)"
                      : "2px solid var(--text-faint)",
                }}
              >
                <span className="t-11 text-[var(--text-soft)] truncate">{m.name}</span>
                <span
                  className="t-9 font-mono uppercase tracking-section"
                  style={{
                    color: m.opsStatus === "running" ? "var(--cykan)" : "var(--text-faint)",
                  }}
                >
                  {m.opsStatus === "running" ? "running" : "armé"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 2 — Derniers livrables */}
      <section className="rail-section-card">
        <SectionTitle
          count={recentAssets.length}
          action={{ label: "Tous", onClick: () => onViewChange("assets") }}
        >
          Derniers livrables
        </SectionTitle>
        {loading && recentAssets.length === 0 ? (
          <SkeletonRow height={100} />
        ) : recentAssets.length === 0 ? (
          <EmptyRow>Aucun livrable produit.</EmptyRow>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {recentAssets.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onClick={() => {
                  /* Future: navigate to asset */
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 3 — Alertes */}
      <section className="rail-section-card">
        <SectionTitle count={alerts.length}>Alertes</SectionTitle>
        <div className="flex flex-col gap-2">
          {alerts.length === 0 ? (
            <EmptyRow>Aucune alerte récente.</EmptyRow>
          ) : (
            alerts.map((alert, idx) => {
              const accent =
                alert.type === "approval_requested"
                  ? "var(--warn)"
                  : alert.type === "run_failed"
                    ? "var(--danger)"
                    : "var(--cykan)";
              return (
                <div
                  key={`${alert.timestamp}-${idx}`}
                  className="flex items-center gap-2 p-2 px-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-sm transition-all duration-base"
                  style={{
                    borderLeftWidth: "2px",
                    borderLeftColor: accent,
                    boxShadow: "var(--shadow-alert-inset)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-pill flex-shrink-0"
                    style={{ background: accent }}
                  />
                  <span className="t-11 text-[var(--text-soft)] truncate flex-1">
                    {(alert.title as string) || alert.type.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

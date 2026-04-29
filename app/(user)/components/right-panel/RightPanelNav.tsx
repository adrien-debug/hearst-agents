"use client";

/**
 * RightPanelNav — Navigation tuiles du panel droit.
 *
 * 4 tuiles cliquables : Général (défaut), Rapports, Missions, Livrables.
 * Chaque tuile montre un compteur et un icône SVG distinctif.
 */

import type { ReactNode } from "react";

export type PanelView = "general" | "reports" | "missions" | "assets";

const GridIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

const ReportIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const TargetIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const PackageIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4l-9-5.19" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

interface NavTileProps {
  id: PanelView;
  icon: ReactNode;
  label: string;
  count: number;
  isActive: boolean;
  onClick: (view: PanelView) => void;
  accent?: string;
}

function NavTile({ id, icon, label, count, isActive, onClick, accent }: NavTileProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`flex flex-col items-center justify-center gap-1 transition-all ${
        isActive ? "opacity-100" : "opacity-60 hover:opacity-80"
      }`}
      style={{
        padding: "var(--space-2)",
        background: isActive ? "var(--surface-1)" : "transparent",
        border: isActive ? "1px solid var(--cykan)" : "1px solid var(--border-shell)",
        borderRadius: "var(--radius-xs)",
      }}
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="t-15 font-bold font-mono" style={{ color: accent || "var(--text)" }}>
        {count.toString().padStart(2, "0")}
      </span>
      <span className="t-9 font-mono uppercase text-[var(--text-faint)] truncate w-full text-center">
        {label}
      </span>
    </button>
  );
}

interface RightPanelNavProps {
  activeView: PanelView;
  onChangeView: (view: PanelView) => void;
  /** Total des livrables (inclut les rapports — sémantique inclusive). */
  assetsCount: number;
  /** Sous-ensemble : assets dont type=report. Affiché dans la tuile "Rapports". */
  reportsCount: number;
  missionsCount: number;
  suggestionsCount: number;
  eventsCount: number;
}

export function RightPanelNav({
  activeView,
  onChangeView,
  assetsCount,
  reportsCount,
  missionsCount,
  suggestionsCount,
  eventsCount: _eventsCount,
}: RightPanelNavProps) {
  return (
    <div
      className="grid grid-cols-4 gap-2"
      style={{
        padding: "var(--space-3)",
        borderBottom: "1px solid var(--border-shell)",
      }}
    >
      <NavTile
        id="general"
        icon={<GridIcon />}
        label="Général"
        count={suggestionsCount + missionsCount}
        isActive={activeView === "general"}
        onClick={onChangeView}
        accent={activeView === "general" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="reports"
        icon={<ReportIcon />}
        label="Rapports"
        count={reportsCount}
        isActive={activeView === "reports"}
        onClick={onChangeView}
        accent={activeView === "reports" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="missions"
        icon={<TargetIcon />}
        label="Missions"
        count={missionsCount}
        isActive={activeView === "missions"}
        onClick={onChangeView}
        accent={activeView === "missions" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="assets"
        icon={<PackageIcon />}
        label="Livrables"
        count={assetsCount}
        isActive={activeView === "assets"}
        onClick={onChangeView}
        accent={activeView === "assets" ? "var(--cykan)" : undefined}
      />
    </div>
  );
}

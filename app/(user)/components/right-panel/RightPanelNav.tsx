"use client";

/**
 * RightPanelNav — Navigation tuiles du panel droit.
 *
 * 4 tuiles cliquables : Général (défaut), Rapports, Missions, Livrables.
 * Chaque tuile montre un compteur et un icône distinctif.
 */

export type PanelView = "general" | "reports" | "missions" | "assets";

interface NavTileProps {
  id: PanelView;
  icon: string;
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
        minWidth: "60px",
      }}
    >
      <span className="t-13">{icon}</span>
      <span className="t-15 font-bold font-mono" style={{ color: accent || "var(--text)" }}>
        {count}
      </span>
      <span className="t-9 font-mono uppercase text-[var(--text-faint)]">{label}</span>
    </button>
  );
}

interface RightPanelNavProps {
  activeView: PanelView;
  onChangeView: (view: PanelView) => void;
  assetsCount: number;
  missionsCount: number;
  suggestionsCount: number;
  eventsCount: number;
}

export function RightPanelNav({
  activeView,
  onChangeView,
  assetsCount,
  missionsCount,
  suggestionsCount,
  eventsCount,
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
        icon="⊞"
        label="Général"
        count={suggestionsCount + missionsCount}
        isActive={activeView === "general"}
        onClick={onChangeView}
        accent={activeView === "general" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="reports"
        icon="⚡"
        label="Rapports"
        count={suggestionsCount}
        isActive={activeView === "reports"}
        onClick={onChangeView}
        accent={activeView === "reports" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="missions"
        icon="🎯"
        label="Missions"
        count={missionsCount}
        isActive={activeView === "missions"}
        onClick={onChangeView}
        accent={activeView === "missions" ? "var(--cykan)" : undefined}
      />
      <NavTile
        id="assets"
        icon="📦"
        label="Livrables"
        count={assetsCount}
        isActive={activeView === "assets"}
        onClick={onChangeView}
        accent={activeView === "assets" ? "var(--cykan)" : undefined}
      />
    </div>
  );
}

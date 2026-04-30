"use client";

import { ReactNode } from "react";

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-mono uppercase"
      style={{
        fontSize: "10px",
        fontWeight: 500,
        letterSpacing: "var(--tracking-label)",
        color: "var(--text-l3)",
      }}
    >
      {children}
    </p>
  );
}

function SectionHead({
  label,
  action,
}: {
  label: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ marginBottom: "var(--space-6)" }}
    >
      <Label>{label}</Label>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="font-mono uppercase transition-colors duration-300 hover:text-[var(--cykan)]"
          style={{
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "var(--tracking-label)",
            color: "var(--text-l3)",
            background: "transparent",
          }}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

const ReportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const DocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

function Row({
  icon,
  label,
  meta,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dash-row group"
    >
      {icon && <span className="dash-row-icon">{icon}</span>}
      <span className="dash-row-label">{label}</span>
      {meta && <span className="dash-row-meta">{meta}</span>}
    </button>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-mono uppercase"
      style={{
        fontSize: "10px",
        letterSpacing: "var(--tracking-label)",
        color: "var(--text-l3)",
        padding: "var(--space-3) 0",
      }}
    >
      {children}
    </p>
  );
}

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
}: GeneralDashboardProps) {
  const assetsCount = Array.isArray(_assets) ? _assets.length : 0;
  const missionsCount = Array.isArray(_missions) ? _missions.length : 0;
  const reportsCount = Array.isArray(_assets)
    ? (_assets as any[]).filter((a) => a.type === "report").length
    : 0;
  const recentAssets = Array.isArray(_assets) ? (_assets as any[]).slice(0, 4) : [];
  const activeMissions = Array.isArray(_missions) ? (_missions as any[]) : [];

  return (
    <div
      className="flex flex-col"
      style={{
        padding: "var(--space-14) var(--space-12) var(--space-12)",
        gap: "var(--space-12)",
      }}
    >
      {/* KPIs — 3 naked numbers, baseline-aligned */}
      <div
        className="grid grid-cols-3"
        style={{ gap: "var(--space-6)", alignItems: "baseline" }}
      >
        {[
          { n: assetsCount,   label: "Assets",   view: "assets" as const },
          { n: missionsCount, label: "Missions", view: "missions" as const },
          { n: reportsCount,  label: "Reports",  view: "reports" as const },
        ].map(({ n, label, view }) => (
          <button
            key={label}
            type="button"
            onClick={() => onViewChange(view)}
            className="kpi-tile group"
          >
            <span className="kpi-num">{n.toString().padStart(2, "0")}</span>
            <span className="kpi-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Active missions */}
      <div>
        <SectionHead
          label="Active missions"
          action={{ label: "All", onClick: () => onViewChange("missions") }}
        />
        {activeMissions.length === 0 ? (
          <EmptyText>No active missions</EmptyText>
        ) : (
          <div className="flex flex-col">
            {activeMissions.map((m) => (
              <Row key={m.id} label={m.name} meta="armed" />
            ))}
          </div>
        )}
      </div>

      {/* Recent assets */}
      <div>
        <SectionHead
          label="Recent assets"
          action={{ label: "All", onClick: () => onViewChange("assets") }}
        />
        {recentAssets.length === 0 ? (
          <EmptyText>No assets yet</EmptyText>
        ) : (
          <div className="flex flex-col">
            {recentAssets.map((a) => (
              <Row
                key={a.id}
                icon={a.type === "report" ? <ReportIcon /> : <DocIcon />}
                label={a.name || a.title || "Asset"}
                meta={(a.type || "file").toUpperCase()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div>
        <SectionHead label="Alerts" />
        <EmptyText>No recent alerts</EmptyText>
      </div>
    </div>
  );
}

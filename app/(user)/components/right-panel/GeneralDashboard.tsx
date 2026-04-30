"use client";

import { ReactNode } from "react";

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
}

function ReportIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="t-9 font-mono uppercase tracking-display text-[var(--text-ghost)]">
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-8 tracking-snug uppercase text-[var(--text-ghost)] opacity-30 hover:opacity-100 hover:text-[var(--text)] transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function DashboardCard({ children, noPadding = false }: { children: ReactNode, noPadding?: boolean }) {
  return (
    <div
      className={`flex flex-col ${noPadding ? '' : 'py-6 px-0'} mb-12 last:mb-0 transition-all duration-500`}
    >
      {children}
    </div>
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
    ? _assets.filter((a: any) => a.type === "report").length
    : 0;

  const recentReports = Array.isArray(_assets)
    ? _assets.filter((a: any) => a.type === "report").slice(0, 3)
    : [];
  const activeMissions = Array.isArray(_missions) ? _missions : [];

  return (
    <div className="flex flex-col px-8 py-12 gap-0">
      {/* KPIs */}
      <DashboardCard noPadding>
        <div className="grid grid-cols-3 gap-0 border-b border-[var(--border-shell)] pb-10">
          <button
            type="button"
            onClick={() => onViewChange("assets")}
            className="group flex flex-col items-start gap-1 hover:opacity-100 transition-all cursor-pointer"
          >
            <span className="t-28 font-bold text-[var(--text)] tabular-nums leading-none tracking-tight">
              {assetsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-display uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
              Assets
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("missions")}
            className="group flex flex-col items-start gap-1 hover:opacity-100 transition-all cursor-pointer"
          >
            <span className="t-28 font-bold text-[var(--text)] tabular-nums leading-none tracking-tight">
              {missionsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-display uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
              Missions
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("reports")}
            className="group flex flex-col items-start gap-1 hover:opacity-100 transition-all cursor-pointer"
          >
            <span className="t-28 font-bold text-[var(--text)] tabular-nums leading-none tracking-tight">
              {reportsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-display uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
              Reports
            </span>
          </button>
        </div>
      </DashboardCard>

      {/* Missions actives */}
      <DashboardCard>
        <SectionLabel
          action={{ label: "Voir tout", onClick: () => onViewChange("missions") }}
        >
          Missions
        </SectionLabel>
        {activeMissions.length === 0 ? (
          <p className="t-10 text-[var(--text-ghost)] py-2 font-light opacity-50">
            Aucune mission.
          </p>
        ) : (
          <div className="flex flex-col gap-0">
            {activeMissions.map((m: any, i: number) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-3 border-b border-[var(--border-shell)] last:border-0 group cursor-pointer transition-all duration-300"
              >
                <span className="t-11 font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] truncate transition-colors">
                  {m.name}
                </span>
                <div className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-[var(--text-ghost)] group-hover:bg-[var(--text)] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* Derniers livrables */}
      <DashboardCard>
        <SectionLabel
          action={{ label: "Voir tout", onClick: () => onViewChange("reports") }}
        >
          Livrables
        </SectionLabel>
        {recentReports.length === 0 ? (
          <p className="t-10 text-[var(--text-ghost)] py-2 font-light opacity-50">
            Aucun livrable.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 mt-2">
            {recentReports.map((report: any, i: number) => {
              const shortTitle = report.name || "Rapport sans titre";

              return (
                <div
                  key={report.id}
                  className="group flex items-center justify-between py-3 border-b border-[var(--border-shell)] last:border-0 cursor-pointer"
                >
                  <span className="t-11 font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] truncate transition-colors">
                    {shortTitle}
                  </span>
                  <span className="t-8 font-mono uppercase text-[var(--text-ghost)] opacity-30 group-hover:opacity-60 transition-opacity">
                    {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* Alertes */}
      <DashboardCard>
        <SectionLabel>Alertes</SectionLabel>
        <p className="t-10 text-[var(--text-ghost)] py-2 font-light opacity-30 italic">
          Système nominal.
        </p>
      </DashboardCard>
    </div>
  );
}

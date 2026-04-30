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
    <div className="flex items-center justify-between mb-6">
      <span className="t-11 font-mono uppercase tracking-[0.3em] text-[var(--text-ghost)]">
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 tracking-[0.2em] uppercase text-[var(--text-ghost)] opacity-40 hover:opacity-100 hover:text-[var(--cykan)] transition-all"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function DashboardCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col py-8 px-6 my-3 bg-gradient-to-b from-[rgba(255,255,255,0.03)] to-[rgba(255,255,255,0.01)] border border-[rgba(255,255,255,0.04)] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md first:mt-0 transition-all duration-500 hover:border-[rgba(255,255,255,0.08)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)]">
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
    <div className="flex flex-col" style={{ padding: "var(--space-6) var(--space-4)", gap: "0" }}>
      {/* KPIs */}
      <DashboardCard>
        <div className="grid grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onViewChange("assets")}
            className="group flex flex-col items-center text-center gap-2 hover:opacity-100 transition-all cursor-pointer"
          >
            <span className="t-34 font-light text-[var(--text)] tabular-nums leading-none group-hover:text-[var(--cykan)] group-hover:drop-shadow-[0_0_8px_rgba(45,212,191,0.5)] transition-all duration-500">
              {assetsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-[0.4em] uppercase text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors">
              Assets
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("missions")}
            className="group flex flex-col items-center text-center gap-2 hover:opacity-100 transition-all cursor-pointer border-x border-[rgba(255,255,255,0.05)]"
          >
            <span className="t-34 font-light text-[var(--text)] tabular-nums leading-none group-hover:text-[var(--cykan)] group-hover:drop-shadow-[0_0_8px_rgba(45,212,191,0.5)] transition-all duration-500">
              {missionsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-[0.4em] uppercase text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors">
              Missions
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("reports")}
            className="group flex flex-col items-center text-center gap-2 hover:opacity-100 transition-all cursor-pointer"
          >
            <span className="t-34 font-light text-[var(--text)] tabular-nums leading-none group-hover:text-[var(--cykan)] group-hover:drop-shadow-[0_0_8px_rgba(45,212,191,0.5)] transition-all duration-500">
              {reportsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-[0.4em] uppercase text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors">
              Reports
            </span>
          </button>
        </div>
      </DashboardCard>

      {/* Missions actives */}
      <DashboardCard>
        <SectionLabel
          action={{ label: "Toutes", onClick: () => onViewChange("missions") }}
        >
          Missions actives
        </SectionLabel>
        {activeMissions.length === 0 ? (
          <p className="t-10 text-[rgba(255,255,255,0.4)] py-2 font-light">
            Aucune mission armée.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {activeMissions.map((m: any, i: number) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-3 px-4 -mx-4 group cursor-pointer rounded-sm hover:bg-[rgba(255,255,255,0.02)] transition-all duration-500"
              >
                <span className="t-13 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] truncate transition-colors">
                  {m.name}
                </span>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-500">
                   <div className="w-1 h-1 rounded-full bg-[var(--cykan)] animate-pulse shadow-[0_0_8px_var(--cykan)]" />
                   <span className="t-8 tracking-[0.3em] uppercase text-[var(--cykan)]">
                    active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* Derniers livrables */}
      <DashboardCard>
        <SectionLabel
          action={{ label: "Tous", onClick: () => onViewChange("reports") }}
        >
          Derniers livrables
        </SectionLabel>
        {recentReports.length === 0 ? (
          <p className="t-10 text-[rgba(255,255,255,0.4)] py-2 font-light">
            Aucun livrable récent.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 mt-2">
            {recentReports.map((report: any, i: number) => {
              const isPdf = report.name?.toLowerCase().endsWith('.pdf');
              const shortTitle = report.name ? report.name.split(' ')[0] : "Report";
              
              return (
                <div
                  key={report.id}
                  className="group flex flex-col items-center gap-3 cursor-pointer"
                >
                  <div className="w-full aspect-[3/4] flex flex-col items-center justify-center border border-[rgba(255,255,255,0.03)] bg-[rgba(255,255,255,0.01)] rounded-sm transition-all duration-500 group-hover:border-[rgba(255,255,255,0.1)] group-hover:bg-[rgba(255,255,255,0.03)] relative overflow-hidden">
                    <span className="text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-all duration-500 group-hover:scale-110">
                      {isPdf ? <PdfIcon /> : <ReportIcon />}
                    </span>
                  </div>
                  <div className="flex flex-col items-center w-full gap-1">
                    <span className="t-11 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] truncate w-full text-center transition-colors duration-500">
                      {shortTitle}
                    </span>
                    <span className="t-8 tracking-[0.1em] uppercase text-[var(--text-ghost)] opacity-40">
                      {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* Alertes */}
      <DashboardCard>
        <SectionLabel count={0}>Alertes</SectionLabel>
        <p className="t-10 text-[rgba(255,255,255,0.4)] py-2 font-light">
          Aucune alerte récente.
        </p>
      </DashboardCard>
    </div>
  );
}

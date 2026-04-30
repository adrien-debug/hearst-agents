"use client";

import { ReactNode } from "react";

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15h3" />
      <path d="M9 12h6" />
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
    <div className="flex items-center justify-between mb-3 px-1">
      <span className="t-12 font-semibold text-[var(--text-soft)]">
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 tracking-display uppercase text-[var(--text-ghost)] opacity-40 hover:opacity-100 hover:text-[var(--cykan)] transition-all"
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
      className={`flex flex-col ${noPadding ? '' : 'px-0'} mb-8 last:mb-0`}
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
    ? _assets.filter((a: any) => a.type === "report").slice(0, 4)
    : [];
  const activeMissions = Array.isArray(_missions) ? _missions : [];

  return (
    <div className="flex flex-col px-8 py-8 gap-0">
      {/* KPIs */}
      <DashboardCard noPadding>
        <div className="grid grid-cols-3 gap-0 border-b border-[var(--border-shell)] pb-8 mb-8">
          <button
            type="button"
            onClick={() => onViewChange("assets")}
            className="group flex flex-col items-start gap-1 cursor-pointer"
          >
            <span className="t-28 font-light text-[var(--text)] tabular-nums leading-none tracking-tight group-hover:text-[var(--cykan)] transition-colors">
              {assetsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-brand uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
              Assets
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("missions")}
            className="group flex flex-col items-start gap-1 cursor-pointer"
          >
            <span className="t-28 font-light text-[var(--text)] tabular-nums leading-none tracking-tight group-hover:text-[var(--cykan)] transition-colors">
              {missionsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-brand uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
              Missions
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("reports")}
            className="group flex flex-col items-start gap-1 cursor-pointer"
          >
            <span className="t-28 font-light text-[var(--text)] tabular-nums leading-none tracking-tight group-hover:text-[var(--cykan)] transition-colors">
              {reportsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-8 tracking-brand uppercase text-[var(--text-ghost)] group-hover:text-[var(--text)] transition-colors">
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
          <p className="t-12 text-[var(--text-faint)] pl-1 py-2 font-light">
            Aucune mission.
          </p>
        ) : (
          <div className="flex flex-col gap-0">
            {activeMissions.map((m: any, i: number) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-2.5 px-3 -mx-3 group cursor-pointer rounded-md hover:bg-[var(--surface-2)] transition-all duration-300"
              >
                <span className="t-14 font-light text-[var(--text-muted)] group-hover:text-[var(--text-soft)] truncate transition-colors">
                  {m.name}
                </span>
                <div className="w-1 h-1 rounded-full bg-[var(--text-ghost)] group-hover:bg-[var(--cykan)] transition-colors" />
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
          <p className="t-12 text-[var(--text-faint)] pl-1 py-2 font-light">
            Aucun livrable.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 mt-1">
            {recentReports.map((report: any, i: number) => {
              const isPdf = report.name?.toLowerCase().endsWith('.pdf');
              const nameWords = report.name ? report.name.split(/\s+/).slice(0, 2).join(' ') : "Rapport";
              const extension = isPdf ? "PDF" : "DOC";

              return (
                <div
                  key={report.id}
                  className="group flex flex-col gap-2 cursor-pointer"
                >
                  <div className="aspect-square w-full bg-[var(--surface-1)] border border-[var(--border-shell)] rounded-md flex flex-col items-center justify-center relative transition-all duration-300 group-hover:border-[var(--border-subtle)] group-hover:bg-[var(--surface-2)]">
                    <span className="text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors">
                      {isPdf ? <PdfIcon /> : <ReportIcon />}
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 t-8 font-mono text-[var(--text-ghost)] opacity-30 group-hover:opacity-100 group-hover:text-[var(--cykan)] transition-all">
                      {extension}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0 px-0.5">
                    <span className="t-11 font-medium text-[var(--text-muted)] group-hover:text-[var(--text-soft)] line-clamp-1 transition-colors">
                      {nameWords}
                    </span>
                    <span className="t-9 font-mono uppercase text-[var(--text-ghost)] opacity-30">
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
        <SectionLabel>Alertes</SectionLabel>
        <p className="t-12 text-[var(--text-faint)] pl-1 py-2 font-light italic">
          Système nominal.
        </p>
      </DashboardCard>
    </div>
  );
}

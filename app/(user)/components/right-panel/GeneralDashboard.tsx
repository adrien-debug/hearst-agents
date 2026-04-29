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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--cykan)] shrink-0">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function SectionLabel({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <span className="inline-flex items-baseline gap-3">
        <span className="border-l-2 border-[var(--cykan)] pl-3 t-11 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.4)] font-medium">
          {children}
        </span>
        {typeof count === "number" && (
          <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)]">
            {count.toString().padStart(2, "0")}
          </span>
        )}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.4)] hover:text-[var(--cykan)] transition-colors"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function DashboardCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col p-6 bg-[rgba(255,255,255,0.015)] border border-[rgba(255,255,255,0.04)] rounded-xl shadow-sm hover:border-[rgba(255,255,255,0.08)] transition-colors duration-300">
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
    <div className="flex flex-col" style={{ padding: "var(--space-6)", gap: "var(--space-4)" }}>
      {/* KPIs */}
      <DashboardCard>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center gap-3">
            <span className="t-28 font-light text-[rgba(255,255,255,0.9)] tabular-nums leading-none">
              {assetsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)]">
              Assets
            </span>
          </div>
          <div className="flex flex-col items-center text-center gap-3 border-l border-[rgba(255,255,255,0.06)]">
            <span className="t-28 font-light text-[rgba(255,255,255,0.9)] tabular-nums leading-none">
              {missionsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)]">
              Missions
            </span>
          </div>
          <div className="flex flex-col items-center text-center gap-3 border-l border-[rgba(255,255,255,0.06)]">
            <span className="t-28 font-light text-[rgba(255,255,255,0.9)] tabular-nums leading-none">
              {reportsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)]">
              Reports
            </span>
          </div>
        </div>
      </DashboardCard>

      {/* Missions actives */}
      <DashboardCard>
        <SectionLabel
          count={activeMissions.length}
          action={{ label: "Toutes", onClick: () => onViewChange("missions") }}
        >
          Missions actives
        </SectionLabel>
        {activeMissions.length === 0 ? (
          <p className="t-10 tracking-[0.15em] uppercase text-[rgba(255,255,255,0.3)] py-3 font-light text-center">
            Aucune mission armée.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {activeMissions.map((m: any, i: number) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-3 px-3 group cursor-pointer rounded-md hover:bg-[rgba(255,255,255,0.02)] transition-colors duration-300"
              >
                <span className="t-13 font-light text-[rgba(255,255,255,0.7)] group-hover:text-[rgba(255,255,255,0.9)] truncate transition-colors">
                  {m.name}
                </span>
                <span className="t-9 tracking-[0.2em] uppercase text-[var(--cykan)]">
                  armé
                </span>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* Derniers livrables */}
      <DashboardCard>
        <SectionLabel
          count={recentReports.length}
          action={{ label: "Tous", onClick: () => onViewChange("reports") }}
        >
          Derniers livrables
        </SectionLabel>
        {recentReports.length === 0 ? (
          <p className="t-10 tracking-[0.15em] uppercase text-[rgba(255,255,255,0.3)] py-3 font-light text-center">
            Aucun livrable récent.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {recentReports.map((report: any, i: number) => {
              const isPdf = report.name?.toLowerCase().endsWith('.pdf');
              return (
                <div
                  key={report.id}
                  className="group relative flex flex-col justify-between aspect-square p-4 cursor-pointer rounded-xl bg-[rgba(255,255,255,0.015)] border border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(45,212,191,0.3)] hover:shadow-[0_0_20px_rgba(45,212,191,0.05)] transition-all duration-500 overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center group-hover:bg-[rgba(45,212,191,0.1)] transition-colors duration-500">
                      <span className="opacity-60 group-hover:opacity-100 group-hover:text-[var(--cykan)] transition-all duration-500">
                        {isPdf ? <PdfIcon /> : <ReportIcon />}
                      </span>
                    </div>
                    <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] group-hover:text-[var(--cykan)] transition-colors duration-500">
                      {isPdf ? "PDF" : "RPT"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="t-13 font-light text-[rgba(255,255,255,0.7)] group-hover:text-[rgba(255,255,255,0.9)] line-clamp-3 leading-snug transition-colors duration-500">
                      {report.name || "Report"}
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
        <p className="t-10 tracking-[0.15em] uppercase text-[rgba(255,255,255,0.3)] py-3 font-light text-center">
          Aucune alerte récente.
        </p>
      </DashboardCard>
    </div>
  );
}

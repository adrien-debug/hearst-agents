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
    <div className="flex items-center justify-between mb-4">
      <span className="inline-flex items-baseline gap-3">
        <span className="t-12 font-semibold text-[rgba(255,255,255,0.9)]">
          {children}
        </span>
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
    <div className="flex flex-col py-4 px-2">
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
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onViewChange("assets")}
            className="group flex flex-col items-center text-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <span className="t-28 font-light text-[rgba(255,255,255,0.95)] tabular-nums leading-none group-hover:text-[var(--cykan)] transition-colors">
              {assetsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] group-hover:text-[var(--cykan)] transition-colors">
              Assets
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("missions")}
            className="group flex flex-col items-center text-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
            style={{ boxShadow: "inset 1px 0 0 0 rgba(255,255,255,0.04)" }}
          >
            <span className="t-28 font-light text-[rgba(255,255,255,0.95)] tabular-nums leading-none group-hover:text-[var(--cykan)] transition-colors">
              {missionsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] group-hover:text-[var(--cykan)] transition-colors">
              Missions
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("reports")}
            className="group flex flex-col items-center text-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
            style={{ boxShadow: "inset 1px 0 0 0 rgba(255,255,255,0.04)" }}
          >
            <span className="t-28 font-light text-[rgba(255,255,255,0.95)] tabular-nums leading-none group-hover:text-[var(--cykan)] transition-colors">
              {reportsCount.toString().padStart(2, "0")}
            </span>
            <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] group-hover:text-[var(--cykan)] transition-colors">
              Reports
            </span>
          </button>
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
          <p className="t-10 text-[rgba(255,255,255,0.4)] py-2 font-light">
            Aucune mission armée.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {activeMissions.map((m: any, i: number) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-2.5 px-3 -mx-3 group cursor-pointer rounded-md hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-300"
              >
                <span className="t-13 font-light text-[rgba(255,255,255,0.7)] group-hover:text-[rgba(255,255,255,0.9)] truncate transition-colors">
                  {m.name}
                </span>
                <span className="t-9 tracking-[0.2em] uppercase text-[var(--cykan)] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
          <p className="t-10 text-[rgba(255,255,255,0.4)] py-2 font-light">
            Aucun livrable récent.
          </p>
        ) : (
          <div className="flex flex-col gap-1 mt-2">
            {recentReports.map((report: any, i: number) => {
              const isPdf = report.name?.toLowerCase().endsWith('.pdf');
              return (
                <div
                  key={report.id}
                  className="group flex items-center justify-between py-2.5 px-3 -mx-3 cursor-pointer rounded-md hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-300"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(45,212,191,0.1)] transition-colors duration-300">
                      <span className="opacity-60 group-hover:opacity-100 group-hover:text-[var(--cykan)] transition-all duration-300">
                        {isPdf ? <PdfIcon /> : <ReportIcon />}
                      </span>
                    </div>
                    <span className="t-13 font-light text-[rgba(255,255,255,0.7)] group-hover:text-[rgba(255,255,255,0.95)] truncate transition-colors duration-300">
                      {report.name || "Report"}
                    </span>
                  </div>
                  <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] shrink-0 pl-3 group-hover:text-[var(--cykan)] transition-colors duration-300">
                    {isPdf ? "PDF" : "RPT"}
                  </span>
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

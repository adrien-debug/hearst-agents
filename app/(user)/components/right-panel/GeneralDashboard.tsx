"use client";

/**
 * GeneralDashboard — Vue Opérationnelle : KPIs + Sections.
 *
 * Structure FIXE :
 * 1. KPI Row (Assets / Missions / Reports)
 * 2. Missions actives
 * 3. Derniers livrables
 * 4. Alertes
 */

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
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
      <span className="t-9 font-mono uppercase tracking-section text-[var(--text-faint)] inline-flex items-baseline gap-2">
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
    <div
      className="flex items-center"
      style={{
        padding: "var(--space-3)",
        background: "var(--card-flat-bg)",
        border: "1px dashed var(--card-flat-border)",
      }}
    >
      <span className="t-11 font-mono uppercase text-[var(--text-faint)]">
        {children}
      </span>
    </div>
  );
}

function KPICard({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center border border-[var(--border-default)]"
      style={{
        padding: "var(--space-4) var(--space-3)",
        background: "var(--surface)",
        borderRadius: "var(--radius-xs)",
        gap: "var(--space-1)",
      }}
    >
      <span className="t-24 font-bold text-[var(--text)]">
        {count.toString().padStart(2, "0")}
      </span>
      <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
        {label}
      </span>
    </div>
  );
}

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
  activeThreadId: _activeThreadId,
  loading: _loading,
}: GeneralDashboardProps) {
  // Mock data pour démo
  const assetsCount = 7;
  const missionsCount = 0;
  const reportsCount = 6;

  const recentReports = [
    { id: "1", name: "Report 1", type: "REPORT" },
    { id: "2", name: "Report 2", type: "REPORT" },
    { id: "3", name: "Report 3", type: "REPORT" },
  ];
  const activeMissions: typeof recentReports = [];

  return (
    <div className="flex flex-col h-full" style={{ padding: "var(--space-3)", gap: "var(--space-4)" }}>
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-2">
        <KPICard label="ASSETS" count={assetsCount} />
        <KPICard label="MISSIONS" count={missionsCount} />
        <KPICard label="REPORTS" count={reportsCount} />
      </div>

      {/* Section 1 — Missions actives */}
      <section>
        <SectionTitle
          count={activeMissions.length}
          action={{ label: "Toutes", onClick: () => onViewChange("missions") }}
        >
          Missions actives
        </SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          {activeMissions.length === 0 ? (
            <EmptyRow>Aucune mission armée.</EmptyRow>
          ) : (
            activeMissions.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--card-flat-bg)",
                  borderLeft: "2px solid var(--text-faint)",
                }}
              >
                <span className="t-11 text-[var(--text-soft)] truncate">{m.name}</span>
                <span className="t-9 font-mono uppercase text-[var(--text-faint)]">armé</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Section 2 — Derniers livrables */}
      <section>
        <SectionTitle
          count={recentReports.length}
          action={{ label: "Tous", onClick: () => onViewChange("reports") }}
        >
          Derniers livrables
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {recentReports.map((report) => (
            <div
              key={report.id}
              className="flex flex-col items-center justify-center border border-[var(--border-default)]"
              style={{
                padding: "var(--space-3)",
                background: "var(--card-flat-bg)",
                borderRadius: "var(--radius-xs)",
                gap: "var(--space-2)",
              }}
            >
              <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                {report.type}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — Alertes */}
      <section>
        <SectionTitle count={0}>Alertes</SectionTitle>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <EmptyRow>Aucune alerte récente.</EmptyRow>
        </div>
      </section>
    </div>
  );
}

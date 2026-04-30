"use client";

/**
 * Carte KPI réutilisable pour /admin/analytics.
 * Tokens uniquement.
 */

interface AnalyticsKpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "cykan" | "warn" | "danger";
}

export function AnalyticsKpiCard({
  label,
  value,
  sub,
  accent = "default",
}: AnalyticsKpiCardProps) {
  const valueColor =
    accent === "cykan"
      ? "text-[var(--cykan)]"
      : accent === "warn"
        ? "text-[var(--warn)]"
        : accent === "danger"
          ? "text-[var(--danger)]"
          : "text-[var(--text)]";

  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
        {label}
      </span>
      <span className={`t-28 font-light tracking-tight ${valueColor}`}>{value}</span>
      {sub && <span className="t-11 text-[var(--text-muted)]">{sub}</span>}
    </div>
  );
}

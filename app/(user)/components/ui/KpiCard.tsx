"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type KpiTone = "default" | "cykan" | "warn" | "danger" | "success" | "money";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KpiTone;
  /** 7 derniers points pour sparkline mini (optionnel). */
  trend?: number[];
  /** Si fourni, la card devient un lien navigable. */
  href?: string;
  /** Affiche un point status à côté du label. */
  statusDot?: "running" | "warn" | "danger" | "success" | null;
  testId?: string;
}

const TONE_COLORS: Record<KpiTone, string> = {
  default: "var(--text-l1)",
  cykan: "var(--cykan)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  success: "var(--color-success)",
  money: "var(--money)",
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 60;
  const h = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const path = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ display: "block" }}
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  trend,
  href,
  statusDot = null,
  testId,
}: KpiCardProps) {
  const valueColor = TONE_COLORS[tone];
  const sparklineColor =
    tone === "warn" || tone === "danger" ? TONE_COLORS[tone] : "var(--cykan)";

  const inner = (
    <div
      data-testid={testId}
      className="group flex flex-col h-full justify-between transition-colors duration-(--duration-base) ease-(--ease-standard)"
      style={{
        gap: "var(--space-1)",
        padding: "var(--space-3)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="t-10 font-medium text-[var(--text-faint)] truncate">{label}</span>
        {statusDot && (
          <span
            className={`context-tile-status is-${statusDot}`}
            style={{ width: "var(--space-2)", height: "var(--space-2)", flexShrink: 0 }}
            aria-hidden
          />
        )}
      </div>
      <div
        className="t-28 font-light tracking-tight tabular-nums leading-none transition-colors group-hover:text-[var(--cykan)]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      <div className="flex items-center justify-between gap-2 min-w-0">
        {sub && (
          <span className="t-9 font-mono tabular-nums text-[var(--text-faint)] truncate">
            {sub}
          </span>
        )}
        {trend && trend.length >= 2 && (
          <span className="shrink-0">
            <Sparkline data={trend} color={sparklineColor} />
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)] rounded-[var(--radius-sm)]">
        {inner}
      </Link>
    );
  }
  return inner;
}

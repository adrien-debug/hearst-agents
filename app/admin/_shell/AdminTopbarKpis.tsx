"use client";

import { useEffect, useState } from "react";

interface Metrics {
  runsPerMin: number;
  p95LatencyMs: number | null;
  errorRate: number;
  sampleSize: number;
}

const REFRESH_MS = 5000;

function fmtLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtErrorRate(rate: number): string {
  if (rate === 0) return "0%";
  if (rate < 0.001) return "<0.1%";
  return `${(rate * 100).toFixed(1)}%`;
}

interface KpiProps {
  label: string;
  value: string;
  tone?: "default" | "warn" | "ok";
  title?: string;
}

function Kpi({ label, value, tone = "default", title }: KpiProps) {
  const valueColor =
    tone === "warn"
      ? "text-(--warn)"
      : tone === "ok"
        ? "text-(--cykan)"
        : "text-text";
  return (
    <div className="flex items-baseline gap-(--space-2)" title={title}>
      <span className="t-9 font-mono uppercase tracking-(--tracking-stretch) text-text-faint">
        {label}
      </span>
      <span className={`t-12 font-mono font-medium tabular-nums ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}

export default function AdminTopbarKpis() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/admin/metrics/live", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setStale(true);
          return;
        }
        const json = (await res.json()) as Metrics;
        if (!cancelled) {
          setMetrics(json);
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    fetchMetrics();
    const t = setInterval(fetchMetrics, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!metrics) {
    return (
      <div className="hidden md:flex items-center gap-(--space-5) text-text-faint t-10 font-mono uppercase tracking-(--tracking-stretch)">
        <span>—</span>
      </div>
    );
  }

  const errorTone =
    metrics.errorRate > 0.05 ? "warn" : metrics.errorRate > 0 ? "default" : "ok";

  return (
    <div
      className={`hidden md:flex items-center gap-(--space-5) ${stale ? "opacity-50" : ""}`}
    >
      <Kpi
        label="runs/min"
        value={String(metrics.runsPerMin)}
        title="Nombre de runs créés dans la dernière minute"
      />
      <span className="size-(--space-1) rounded-(--radius-pill) bg-(--text-ghost)" aria-hidden />
      <Kpi
        label="p95"
        value={fmtLatency(metrics.p95LatencyMs)}
        title="Latence p95 sur les 100 derniers runs (dernière heure)"
      />
      <span className="size-(--space-1) rounded-(--radius-pill) bg-(--text-ghost)" aria-hidden />
      <Kpi
        label="err"
        value={fmtErrorRate(metrics.errorRate)}
        tone={errorTone}
        title={`Taux d'échec sur ${metrics.sampleSize} runs de la dernière heure`}
      />
    </div>
  );
}

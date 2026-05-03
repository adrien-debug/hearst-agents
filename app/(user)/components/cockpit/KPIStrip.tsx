"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "../ui/KpiCard";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface KPIStripProps {
  data: CockpitTodayPayload;
}

interface UsageSnapshot {
  usedUSD: number;
  budgetUSD: number;
  runs: number;
  /** 7 dernières runs cost — pour sparkline. Optionnel : non exposé par l'API actuelle. */
  trend?: number[];
}

const USAGE_REFRESH_MS = 60_000;

export function KPIStrip({ data }: KPIStripProps) {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v2/usage/today", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as UsageSnapshot;
        if (!cancelled) setUsage(json);
      } catch {
        // fail-soft
      }
    };
    void load();
    const id = window.setInterval(load, USAGE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // 1. Assets
  const assetsCount = data.counts.assets;
  const reportsCount = data.counts.reports;

  // 2. Missions
  const missionsTotal = data.counts.missions;
  const runningCount = data.missionsRunning.filter((m) => m.status === "running").length;
  const failedCount = data.missionsRunning.filter((m) => m.status === "failed").length;

  // 3. Reports favoris
  const favCount = data.favoriteReports.length;
  const favSub = data.favoriteReports
    .slice(0, 3)
    .map((r) => r.title)
    .join(" · ");

  // 4. Usage
  const usagePct = usage && usage.budgetUSD > 0 ? (usage.usedUSD / usage.budgetUSD) * 100 : 0;
  const usageTone = usagePct >= 95 ? "danger" : usagePct >= 80 ? "warn" : "default";
  const usageValue = usage
    ? `$${usage.usedUSD.toFixed(2)}`
    : "—";
  const usageSub = usage ? `/ $${usage.budgetUSD.toFixed(0)} · ${usagePct.toFixed(0)}%` : "—";

  // 5. Signals critiques
  const criticalCount = data.watchlist.filter(
    (w) => w.anomaly?.severity === "critical",
  ).length;
  const signalsTone = criticalCount > 0 ? "danger" : "success";
  const signalsValue = criticalCount.toString().padStart(2, "0");
  const signalsSub =
    criticalCount > 0
      ? `${criticalCount} critique${criticalCount > 1 ? "s" : ""}`
      : "Aucune alerte";

  return (
    <section
      className="grid shrink-0"
      style={{
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: "var(--space-3)",
        height: "var(--space-20)",
      }}
      aria-label="Récap KPIs"
    >
      <KpiCard
        label="Assets"
        value={assetsCount.toString().padStart(2, "0")}
        sub={`${reportsCount} report${reportsCount > 1 ? "s" : ""}`}
        href="/assets"
        testId="kpi-assets"
      />
      <KpiCard
        label="Missions"
        value={`${runningCount.toString().padStart(2, "0")}/${missionsTotal.toString().padStart(2, "0")}`}
        sub={failedCount > 0 ? `${failedCount} en échec` : "Tout va bien"}
        tone={failedCount > 0 ? "warn" : "default"}
        statusDot={runningCount > 0 ? "running" : null}
        href="/missions"
        testId="kpi-missions"
      />
      <KpiCard
        label="Reports"
        value={favCount.toString().padStart(2, "0")}
        sub={favSub || "Catalog"}
        href="/reports"
        testId="kpi-reports"
      />
      <KpiCard
        label="Usage du jour"
        value={usageValue}
        sub={usageSub}
        tone={usageTone}
        trend={usage?.trend}
        href="/runs"
        testId="kpi-usage"
      />
      <KpiCard
        label="Signaux"
        value={signalsValue}
        sub={signalsSub}
        tone={signalsTone}
        statusDot={criticalCount > 0 ? "danger" : null}
        testId="kpi-signals"
      />
    </section>
  );
}

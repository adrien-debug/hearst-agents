"use client";

import { KpiCard } from "../ui/KpiCard";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface KPIStripProps {
  data: CockpitTodayPayload;
}

/**
 * Récap discret : Assets, Missions, Reports uniquement.
 * Variations vertes optionnelles depuis la watchlist (delta texte API).
 */
export function KPIStrip({ data }: KPIStripProps) {
  const assetsCount = data.counts.assets;
  const reportsCount = data.counts.reports;

  const missionsTotal = data.counts.missions;
  const runningCount = data.missionsRunning.filter((m) => m.status === "running").length;
  const failedCount = data.missionsRunning.filter((m) => m.status === "failed").length;

  const favCount = data.favoriteReports.length;
  const favSub = data.favoriteReports
    .slice(0, 3)
    .map((r) => r.title)
    .join(" · ");

  const w = data.watchlist;
  const delta0 = w[0]?.delta?.trim();
  const delta1 = w[1]?.delta?.trim();
  const assetsDelta =
    delta0 && (delta0.startsWith("+") || delta0.startsWith("-")) ? delta0 : undefined;
  const reportsDelta =
    delta1 && (delta1.startsWith("+") || delta1.startsWith("-"))
      ? delta1
      : w[2]?.delta?.trim() &&
          (w[2].delta.trim().startsWith("+") || w[2].delta.trim().startsWith("-"))
        ? w[2].delta.trim()
        : undefined;

  const missionFillPct =
    missionsTotal > 0 ? Math.round((runningCount / missionsTotal) * 100) : 0;

  return (
    <section
      className="grid shrink-0"
      style={{
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "var(--space-5)",
        maxWidth: "min(820px, 100%)",
        marginInline: "auto",
        minHeight: "var(--space-20)",
      }}
      aria-label="Récap KPIs"
    >
      <KpiCard
        label="Assets"
        value={assetsCount.toString().padStart(2, "0")}
        delta={assetsDelta}
        sub={`${reportsCount} report${reportsCount > 1 ? "s" : ""}`}
        href="/assets"
        testId="kpi-assets"
      />
      <KpiCard
        label="Missions"
        value={`${runningCount.toString().padStart(2, "0")}/${missionsTotal.toString().padStart(2, "0")}`}
        delta={undefined}
        missionFillPct={missionFillPct}
        sub={failedCount > 0 ? `${failedCount} en échec` : "Tout va bien"}
        tone={failedCount > 0 ? "warn" : "default"}
        statusDot={runningCount > 0 ? "running" : null}
        href="/missions"
        testId="kpi-missions"
      />
      <KpiCard
        label="Reports"
        value={favCount.toString().padStart(2, "0")}
        delta={reportsDelta}
        sub={favSub || "Catalog"}
        href="/reports"
        testId="kpi-reports"
      />
    </section>
  );
}

"use client";

import { SectionHeader } from "../ui/SectionHeader";
import { EmptyState } from "../ui/EmptyState";
import type { CockpitTodayPayload, CockpitWatchlistItem } from "@/lib/cockpit/today";

interface WatchlistMiniProps {
  data: CockpitTodayPayload;
}

const MAX_ITEMS = 3;

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 40;
  const h = 12;
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

function WatchRow({ item }: { item: CockpitWatchlistItem }) {
  const critical = item.anomaly?.severity === "critical";
  const warning = item.anomaly?.severity === "warning";
  const tone = critical ? "var(--danger)" : warning ? "var(--warn)" : "var(--text-l1)";
  const sparklineColor = critical ? "var(--danger)" : warning ? "var(--warn)" : "var(--cykan)";
  const arrow = item.anomaly?.direction === "up" ? "↗" : item.anomaly?.direction === "down" ? "↘" : "→";

  return (
    <li
      className="flex items-center w-full gap-3"
      style={{
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-xs)",
      }}
    >
      <span className="t-11 font-light text-[var(--text-soft)] truncate min-w-0 flex-1">
        {item.label}
      </span>
      <div className="flex items-baseline justify-end gap-2 shrink-0">
        <span className="t-13 font-medium tabular-nums" style={{ color: tone }}>
          {item.value}
        </span>
        {item.delta && (
          <span className="t-9 font-mono tabular-nums text-[var(--text-faint)] whitespace-nowrap">
            {arrow} {item.delta}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <MiniSparkline data={item.trend} color={sparklineColor} />
        {critical && (
          <span className="t-9" style={{ color: "var(--danger)" }} aria-label="Critical">
            ⚠
          </span>
        )}
      </div>
    </li>
  );
}

export function WatchlistMini({ data }: WatchlistMiniProps) {
  const items = data.watchlist.slice(0, MAX_ITEMS);
  const hasItems = items.length > 0;

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="Watchlist">
      <SectionHeader label="Watchlist" />
      {hasItems ? (
        <ul className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ gap: "var(--space-1)" }}>
          {items.map((item) => (
            <WatchRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <EmptyState
          density="compact"
          title="No KPIs tracked"
          description="Connect Stripe or Linear to track your metrics."
          cta={{ label: "View apps →", href: "/apps" }}
        />
      )}
    </section>
  );
}

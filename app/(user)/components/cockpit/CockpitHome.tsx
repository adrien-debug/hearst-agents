"use client";

import { CockpitHeader } from "./CockpitHeader";
import { ActivityStrip } from "./ActivityStrip";
import { KPIStrip } from "./KPIStrip";
import { CockpitAgenda } from "./CockpitAgenda";
import { WatchlistMini } from "./WatchlistMini";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface CockpitHomeProps {
  data: CockpitTodayPayload;
}

/**
 * CockpitHome — home Cockpit (mode="cockpit").
 *
 * Layout : Header → ActivityStrip → KPIStrip → Agenda/Veille repliable.
 */
export function CockpitHome({ data }: CockpitHomeProps) {
  return (
    <div
      className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={{
        padding: "var(--space-6)",
        gap: "var(--space-5)",
      }}
    >
      <CockpitHeader data={data} />
      <ActivityStrip data={data} />

      <div
        className="flex flex-col shrink-0"
        style={{
          gap: "var(--space-2)",
          paddingBottom: "var(--space-3)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <KPIStrip data={data} />
      </div>

      <details
        className="shrink-0 border-t"
        style={{
          borderColor: "var(--border-subtle)",
          paddingTop: "var(--space-2)",
        }}
      >
        <summary
          className="cursor-pointer flex items-center gap-2 t-13 font-medium text-text-soft transition-opacity hover:opacity-80 group"
          style={{ listStyle: "none" }}
        >
          Agenda & watchlist
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 group-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div
          className="grid min-h-0 shrink-0"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "var(--space-3)",
            marginTop: "var(--space-3)",
            maxHeight: "min(132px, 22vh)",
            overflowY: "auto",
          }}
        >
          <CockpitAgenda data={data} />
          <WatchlistMini data={data} />
        </div>
      </details>
    </div>
  );
}

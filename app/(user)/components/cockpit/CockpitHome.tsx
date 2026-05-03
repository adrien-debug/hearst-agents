"use client";

import { CockpitHeader } from "./CockpitHeader";
import { ActivityStrip } from "./ActivityStrip";
import { KPIStrip } from "./KPIStrip";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { CockpitAgenda } from "./CockpitAgenda";
import { WatchlistMini } from "./WatchlistMini";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface CockpitHomeProps {
  data: CockpitTodayPayload;
}

/**
 * CockpitHome — orchestrateur de la home Cockpit (mode="cockpit").
 *
 * Layout : Header → ActivityStrip → KPI → Actions rapides → Agenda + Watchlist.
 * Les logos d’apps restent uniquement sous le chat (`ChatInput`).
 */
export function CockpitHome({ data }: CockpitHomeProps) {
  return (
    <div
      className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
      style={{
        padding: "var(--space-6)",
        gap: "var(--space-3)",
      }}
    >
      <CockpitHeader data={data} />
      <ActivityStrip data={data} />

      {/* KPI puis séparation visuelle avant Actions rapides */}
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

      <div
        className="flex flex-col min-h-0 shrink-0"
        style={{
          height: "var(--space-40)",
          paddingTop: "var(--space-2)",
        }}
      >
        <QuickActionsGrid data={data} />
      </div>

      {/* Split 60/40 : Agenda + Watchlist */}
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: "minmax(0, 60fr) minmax(0, 40fr)",
          gap: "var(--space-4)",
        }}
      >
        <CockpitAgenda data={data} />
        <WatchlistMini data={data} />
      </div>
    </div>
  );
}

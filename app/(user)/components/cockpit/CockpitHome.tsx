"use client";

import { CockpitHeader } from "./CockpitHeader";
import { ActivityStrip } from "./ActivityStrip";
import { KPIStrip } from "./KPIStrip";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { AgentsConstellation } from "./AgentsConstellation";
import { CockpitAgenda } from "./CockpitAgenda";
import { WatchlistMini } from "./WatchlistMini";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface CockpitHomeProps {
  data: CockpitTodayPayload;
}

/**
 * CockpitHome — orchestrateur de la home Cockpit (mode="cockpit").
 *
 * Layout : carte centrale détachée (radius lg + padding shell), contenu
 * organisé en grille 2D pour tenir dans une seule fenêtre 1440×900 sans
 * scroll. 6 zones : Header / ActivityStrip / KPIStrip /
 * QuickActions+Constellation (split horizontal) / Agenda+Watchlist (split).
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
      <KPIStrip data={data} />

      {/* Split 58/42 : QuickActions + AgentsConstellation */}
      <div
        className="grid min-h-0 shrink-0"
        style={{
          gridTemplateColumns: "minmax(0, 58fr) minmax(0, 42fr)",
          gap: "var(--space-4)",
          height: "var(--space-40)",
        }}
      >
        <QuickActionsGrid data={data} />
        <AgentsConstellation data={data} />
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

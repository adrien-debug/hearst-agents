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
 * Layout : Header → ActivityStrip → bande KPI + agents (droite, sous Usage &
 * Signaux) → Quick Actions pleine largeur → Agenda + Watchlist.
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

      {/* KPI — grille 5 cols ; ligne suivante : vide sur cols 1–3, agents cols 4–5 */}
      {/* KPI + agents : bord bas pour ancrer la hiérarchie avant Actions rapides */}
      <div
        className="flex flex-col shrink-0"
        style={{
          gap: "var(--space-2)",
          paddingBottom: "var(--space-3)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <KPIStrip data={data} />
        <div
          className="grid shrink-0"
          style={{
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "var(--space-3)",
            alignItems: "center",
          }}
        >
          <div
            style={{ gridColumn: "1 / 4", minHeight: "var(--space-14)" }}
            aria-hidden
            className="min-h-0"
          />
          <div style={{ gridColumn: "4 / 6", minWidth: 0 }}>
            <AgentsConstellation data={data} layout="band" />
          </div>
        </div>
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

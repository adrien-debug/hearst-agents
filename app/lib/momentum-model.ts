/**
 * Pure model for "momentum" — active runs, missions, focal work.
 * Used by useMomentum() and unit tests (incl. SSE simulation fixtures).
 */

import type { RightPanelData } from "@/lib/ui/right-panel/types";
import type { FocalObject, FocalObjectStatus } from "@/lib/right-panel/objects";

export type MomentumKind = "run" | "mission" | "focal";

export interface MomentumItem {
  id: string;
  kind: MomentumKind;
  name: string;
  /** Normalized activity label (running, awaiting_approval, …) */
  status: string;
}

const ACTIVE_FOCAL: ReadonlySet<FocalObjectStatus> = new Set([
  "composing",
  "delivering",
  "awaiting_approval",
  "active",
]);

export function buildMomentumItems(
  data: RightPanelData,
  focal: FocalObject | null,
): MomentumItem[] {
  const items: MomentumItem[] = [];

  const run = data.currentRun;
  if (run && run.status === "running") {
    items.push({
      id: `run:${run.id}`,
      kind: "run",
      name: "Orchestration",
      status: run.status,
    });
  }

  for (const m of data.missions ?? []) {
    if (m.opsStatus === "running" || m.opsStatus === "blocked") {
      items.push({
        id: `mission:${m.id}`,
        kind: "mission",
        name: m.name || "Mission",
        status: m.opsStatus,
      });
    }
  }

  if (focal && ACTIVE_FOCAL.has(focal.status)) {
    items.push({
      id: `focal:${focal.id}`,
      kind: "focal",
      name: focal.title || "Manifestation",
      status: focal.status,
    });
  }

  return items;
}

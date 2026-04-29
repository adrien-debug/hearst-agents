/**
 * Stage Data Store — vue partagée Stages ↔ ContextRail (C-light).
 *
 * Pattern : chaque Stage écrit son state local dans une slice via
 * useEffect (snapshot pur, pas de logique). Les sub-rails du ContextRail
 * lisent en read-only. Aucune logique business n'est dupliquée — les
 * Stages restent la source de vérité, ce store n'est qu'un miroir.
 */

import { create } from "zustand";
import type { AssetVariant } from "@/lib/assets/variants";
import type { KgNode, KgEdge } from "@/lib/memory/kg";

interface MeetingActionItem {
  action: string;
  owner?: string;
  deadline?: string;
}

interface SimulationVariable {
  key: string;
  value: string;
}

interface SimulationScenario {
  name: string;
  narrative: string;
  metrics: Record<string, string>;
  risks: string[];
  probability: number;
}

type SimulationPhase = "idle" | "running" | "done";

interface MeetingSlice {
  actionItems: MeetingActionItem[];
  transcript: string;
  status: string;
}

interface SimulationSlice {
  scenario: string;
  variables: SimulationVariable[];
  scenarios: SimulationScenario[];
  phase: SimulationPhase;
}

interface AssetSlice {
  assetId: string | null;
  assetTitle: string;
  variants: AssetVariant[];
}

interface KgSlice {
  graph: { nodes: KgNode[]; edges: KgEdge[] };
  selectedNode: KgNode | null;
}

interface StageDataState {
  meeting: MeetingSlice;
  simulation: SimulationSlice;
  asset: AssetSlice;
  kg: KgSlice;
  setMeeting: (slice: MeetingSlice) => void;
  setSimulation: (slice: SimulationSlice) => void;
  setAsset: (slice: AssetSlice) => void;
  setKg: (slice: KgSlice) => void;
}

const EMPTY_MEETING: MeetingSlice = { actionItems: [], transcript: "", status: "" };
const EMPTY_SIMULATION: SimulationSlice = { scenario: "", variables: [], scenarios: [], phase: "idle" };
const EMPTY_ASSET: AssetSlice = { assetId: null, assetTitle: "", variants: [] };
const EMPTY_KG: KgSlice = { graph: { nodes: [], edges: [] }, selectedNode: null };

export const useStageData = create<StageDataState>((set) => ({
  meeting: EMPTY_MEETING,
  simulation: EMPTY_SIMULATION,
  asset: EMPTY_ASSET,
  kg: EMPTY_KG,
  setMeeting: (slice) => set({ meeting: slice }),
  setSimulation: (slice) => set({ simulation: slice }),
  setAsset: (slice) => set({ asset: slice }),
  setKg: (slice) => set({ kg: slice }),
}));

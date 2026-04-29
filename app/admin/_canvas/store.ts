"use client";

import { create } from "zustand";
import type { NodeId } from "./topology";

export type NodeState = "idle" | "active" | "success" | "failed" | "blocked" | "disabled";

export type Mode = "idle" | "live" | "replay";

export interface FlowPacket {
  id: string;
  edgeId: string;
  bornAt: number;
}

export interface RunTrailEntry {
  edgeId: string;
  ts: number;
}

export interface CanvasState {
  mode: Mode;
  nodeStates: Record<NodeId, NodeState>;
  packets: FlowPacket[];
  selectedRunId: string | null;
  selectedNodeId: NodeId | null;
  lastEventAt: number | null;
  /** Traversées récentes des edges — alimente le trail 4s sur FlowEdge. */
  runTrail: RunTrailEntry[];
  /** Replie la colonne droite (NodeDetailPanel + RunRail). */
  asideCollapsed: boolean;
  /** Usage par edge sur les 100 derniers runs — null pendant le chargement. */
  edgeUsage: Record<string, number> | null;
  edgeUsageTotal: number;

  setMode: (mode: Mode) => void;
  setNodeState: (id: NodeId, state: NodeState) => void;
  resetNodes: () => void;
  emitPacket: (edgeId: string) => void;
  cleanupPackets: (ttlMs?: number) => void;
  cleanupTrail: (ttlMs?: number) => void;
  setSelectedRunId: (id: string | null) => void;
  setSelectedNodeId: (id: NodeId | null) => void;
  setLastEventAt: (ts: number) => void;
  toggleAsideCollapsed: () => void;
  setEdgeUsage: (usage: Record<string, number>, total: number) => void;
}

const ALL_NODES: NodeId[] = [
  "entry",
  "router",
  "safety",
  "intent",
  "preflight",
  "tools",
  "agent",
  "research",
  "pipeline",
  "complete",
];

function freshNodeStates(): Record<NodeId, NodeState> {
  return ALL_NODES.reduce((acc, id) => {
    acc[id] = "idle";
    return acc;
  }, {} as Record<NodeId, NodeState>);
}

let packetCounter = 0;

const ASIDE_STORAGE_KEY = "canvas-aside-collapsed";

export const useCanvasStore = create<CanvasState>((set) => ({
  mode: "idle",
  nodeStates: freshNodeStates(),
  packets: [],
  selectedRunId: null,
  selectedNodeId: null,
  lastEventAt: null,
  runTrail: [],
  // Initialisé à false — lecture localStorage dans le composant avec mounted guard.
  asideCollapsed: false,
  edgeUsage: null,
  edgeUsageTotal: 0,

  setMode: (mode) => set({ mode }),

  setNodeState: (id, state) =>
    set((s) => ({ nodeStates: { ...s.nodeStates, [id]: state } })),

  resetNodes: () => set({ nodeStates: freshNodeStates(), packets: [], runTrail: [] }),

  emitPacket: (edgeId) =>
    set((s) => ({
      packets: [
        ...s.packets,
        { id: `p-${++packetCounter}-${Date.now()}`, edgeId, bornAt: Date.now() },
      ],
      runTrail: [...s.runTrail, { edgeId, ts: Date.now() }],
    })),

  cleanupPackets: (ttlMs = 1500) =>
    set((s) => {
      const cutoff = Date.now() - ttlMs;
      const next = s.packets.filter((p) => p.bornAt > cutoff);
      return next.length === s.packets.length ? s : { packets: next };
    }),

  cleanupTrail: (ttlMs = 4000) =>
    set((s) => {
      const cutoff = Date.now() - ttlMs;
      const next = s.runTrail.filter((t) => t.ts > cutoff);
      return next.length === s.runTrail.length ? s : { runTrail: next };
    }),

  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setLastEventAt: (ts) => set({ lastEventAt: ts }),

  toggleAsideCollapsed: () =>
    set((s) => {
      const next = !s.asideCollapsed;
      try {
        window.localStorage.setItem(ASIDE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage indisponible — état en mémoire uniquement.
      }
      return { asideCollapsed: next };
    }),

  setEdgeUsage: (usage, total) => set({ edgeUsage: usage, edgeUsageTotal: total }),
}));

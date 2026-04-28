/**
 * Canvas zustand store — node states, packets, mode.
 *
 * Drives all visual changes in the canvas. Updated by the event reducer
 * (event-reducer.ts) when SSE events arrive (live) or when the replay
 * timer fires (use-replay).
 */

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
  /** Recent edge traversals — drives the trailing 4s afterglow on FlowEdge. */
  runTrail: RunTrailEntry[];
  /** Collapses the right-hand canvas aside (NodeDetailPanel + RunRail). */
  asideCollapsed: boolean;
  /** Per-edge usage count from the last 100 runs — null while loading. */
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

function readAsideCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ASIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useCanvasStore = create<CanvasState>((set) => ({
  mode: "idle",
  nodeStates: freshNodeStates(),
  packets: [],
  selectedRunId: null,
  selectedNodeId: null,
  lastEventAt: null,
  runTrail: [],
  asideCollapsed: readAsideCollapsed(),
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
        // localStorage unavailable — in-memory only.
      }
      return { asideCollapsed: next };
    }),
  setEdgeUsage: (usage, total) => set({ edgeUsage: usage, edgeUsageTotal: total }),
}));

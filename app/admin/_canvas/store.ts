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

export interface CanvasState {
  mode: Mode;
  nodeStates: Record<NodeId, NodeState>;
  packets: FlowPacket[];
  selectedRunId: string | null;
  selectedNodeId: NodeId | null;
  lastEventAt: number | null;

  setMode: (mode: Mode) => void;
  setNodeState: (id: NodeId, state: NodeState) => void;
  resetNodes: () => void;
  emitPacket: (edgeId: string) => void;
  cleanupPackets: (ttlMs?: number) => void;
  setSelectedRunId: (id: string | null) => void;
  setSelectedNodeId: (id: NodeId | null) => void;
  setLastEventAt: (ts: number) => void;
}

const ALL_NODES: NodeId[] = [
  "entry",
  "router",
  "safety",
  "intent",
  "preflight",
  "userdata",
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

export const useCanvasStore = create<CanvasState>((set) => ({
  mode: "idle",
  nodeStates: freshNodeStates(),
  packets: [],
  selectedRunId: null,
  selectedNodeId: null,
  lastEventAt: null,

  setMode: (mode) => set({ mode }),

  setNodeState: (id, state) =>
    set((s) => ({ nodeStates: { ...s.nodeStates, [id]: state } })),

  resetNodes: () => set({ nodeStates: freshNodeStates(), packets: [] }),

  emitPacket: (edgeId) =>
    set((s) => ({
      packets: [
        ...s.packets,
        { id: `p-${++packetCounter}-${Date.now()}`, edgeId, bornAt: Date.now() },
      ],
    })),

  cleanupPackets: (ttlMs = 1500) =>
    set((s) => {
      const cutoff = Date.now() - ttlMs;
      const next = s.packets.filter((p) => p.bornAt > cutoff);
      return next.length === s.packets.length ? s : { packets: next };
    }),

  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setLastEventAt: (ts) => set({ lastEventAt: ts }),
}));

/**
 * Runtime Store — Zustand
 *
 * Gère l'état runtime SSE, events, et connexion au orchestrator.
 * Remplace : RunStreamContext + HaloRuntimeContext
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type StreamEvent = {
  type: string;
  timestamp: number;
  [key: string]: unknown;
};

export type CoreState = "idle" | "connecting" | "streaming" | "processing" | "error";

interface RuntimeState {
  // Connection
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // Events
  events: StreamEvent[];
  addEvent: (event: { type: string;[key: string]: unknown }) => void;
  clearEvents: () => void;

  // Core state (derived from events)
  coreState: CoreState;
  flowLabel: string | null;
  currentRunId: string | null;

  // Actions
  startRun: (runId: string) => void;
  completeRun: () => void;
  failRun: (error: string) => void;
}

const MAX_EVENTS = 50;

export const useRuntimeStore = create<RuntimeState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    connected: false,
    events: [],
    coreState: "idle",
    flowLabel: null,
    currentRunId: null,

    // Actions
    setConnected: (connected) => set({ connected }),

    addEvent: (event) => {
      set((state) => {
        const newEvent: StreamEvent = { ...event, timestamp: Date.now() };
        return {
          events: [newEvent, ...state.events].slice(0, MAX_EVENTS),
        };
      });

      // Auto-update core state based on event type
      switch (event.type) {
        case "run_started":
          set({
            coreState: "streaming",
            currentRunId: event.run_id as string,
            flowLabel: event.flow_label as string || null,
          });
          break;
        case "run_completed":
          set({ coreState: "processing", flowLabel: null });
          setTimeout(() => {
            if (get().coreState === "processing") {
              set({ coreState: "idle", currentRunId: null });
            }
          }, 500);
          break;
        case "run_failed":
          set({ coreState: "error", flowLabel: null });
          break;
      }
    },

    clearEvents: () => set({ events: [] }),

    startRun: (runId) => set({
      coreState: "streaming",
      currentRunId: runId,
      connected: true,
    }),

    completeRun: () => set({
      coreState: "idle",
      currentRunId: null,
      flowLabel: null,
    }),

    failRun: (error) => set({
      coreState: "error",
      flowLabel: error,
    }),
  }))
);

// Selectors pour éviter re-rendus inutiles
export const selectIsRunning = (state: RuntimeState) => state.coreState !== "idle";
export const selectIsIdle = (state: RuntimeState) => state.coreState === "idle";

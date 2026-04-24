/**
 * Runtime Store — Zustand
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useFocalStore, type FocalType, type FocalStatus } from "./focal";

export type StreamEvent = {
  type: string;
  timestamp: number;
  [key: string]: unknown;
};

export type CoreState = "idle" | "connecting" | "streaming" | "processing" | "error" | "awaiting_approval" | "awaiting_clarification";

interface RuntimeState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
  events: StreamEvent[];
  addEvent: (event: { type: string;[key: string]: unknown }) => void;
  clearEvents: () => void;
  coreState: CoreState;
  flowLabel: string | null;
  currentRunId: string | null;
  startRun: (runId: string) => void;
  completeRun: () => void;
  failRun: (error: string) => void;
}

const MAX_EVENTS = 50;

export const useRuntimeStore = create<RuntimeState>()(
  subscribeWithSelector((set, get) => ({
    connected: false,
    events: [],
    coreState: "idle",
    flowLabel: null,
    currentRunId: null,

    setConnected: (connected) => set({ connected }),

    addEvent: (event) => {
      set((state) => {
        const newEvent: StreamEvent = { ...event, timestamp: Date.now() };
        return { events: [newEvent, ...state.events].slice(0, MAX_EVENTS) };
      });

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
        case "approval_requested":
          set({
            coreState: "awaiting_approval",
            flowLabel: "Validation requise",
          });
          break;
        case "clarification_requested":
          set({
            coreState: "awaiting_clarification",
            flowLabel: "Précision requise",
          });
          break;
        case "run_suspended": {
          const reason = event.reason as string;
          if (reason === "awaiting_approval") {
            set({ coreState: "awaiting_approval", flowLabel: "Validation requise" });
          } else if (reason === "awaiting_clarification") {
            set({ coreState: "awaiting_clarification", flowLabel: "Précision requise" });
          }
          break;
        }
        case "run_resumed": {
          // Return to active state if we were in a waiting state
          const currentState = get().coreState;
          if (currentState === "awaiting_approval" || currentState === "awaiting_clarification") {
            set({ coreState: "streaming", flowLabel: event.flow_label as string || "En cours..." });
          }
          break;
        }
        case "focal_object_ready":
          const focalData = event.focal_object as Record<string, unknown>;
          if (focalData) {
            useFocalStore.getState().setFocal({
              id: (focalData.id as string) ?? "",
              type: ((focalData.objectType ?? focalData.type) as FocalType) ?? "report",
              status: (focalData.status as FocalStatus) ?? "delivered",
              title: (focalData.title as string) ?? "Untitled",
              body: (focalData.body as string) ?? (focalData.summary as string) ?? "",
              summary: (focalData.summary as string) ?? undefined,
              sections: (focalData.sections as { heading?: string; body: string }[]) ?? undefined,
              wordCount: focalData.wordCount as number | undefined,
              provider: focalData.provider as string | undefined,
              createdAt: (focalData.createdAt as number) ?? Date.now(),
              updatedAt: (focalData.updatedAt as number) ?? Date.now(),
            });
          }
          break;
      }
    },

    clearEvents: () => set({ events: [] }),

    startRun: (runId) => set({ coreState: "streaming", currentRunId: runId, connected: true }),
    completeRun: () => set({ coreState: "idle", currentRunId: null, flowLabel: null }),
    failRun: (error) => set({ coreState: "error", flowLabel: error }),
  }))
);

export const selectIsRunning = (state: RuntimeState) => state.coreState !== "idle";
export const selectIsIdle = (state: RuntimeState) => state.coreState === "idle";

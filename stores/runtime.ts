/**
 * Runtime Store — Zustand
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useFocalStore, type FocalType, type FocalStatus } from "./focal";
import { useNavigationStore } from "./navigation";

export type StreamEvent = {
  type: string;
  timestamp: number;
  [key: string]: unknown;
};

export type CoreState = "idle" | "connecting" | "streaming" | "processing" | "error" | "awaiting_approval" | "awaiting_clarification";

// ── Mission Control B1 — multi-step plan slice ─────────────────

export type PlanStepStatus = "idle" | "running" | "awaiting_approval" | "done" | "error" | "skipped";

export interface PlanStepState {
  id: string;
  kind: string;
  label: string;
  status: PlanStepStatus;
  output?: string;
  costUSD?: number;
  latencyMs?: number;
  providerId?: string;
  approvalPreview?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PlanState {
  id: string;
  intent: string;
  steps: PlanStepState[];
  estimatedCostUsd: number;
  totalCostUsd: number;
  requiredApps: string[];
  status: "preview" | "running" | "awaiting_approval" | "completed" | "failed";
}

interface RuntimeState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
  events: StreamEvent[];
  addEvent: (event: { type: string;[key: string]: unknown }) => void;
  clearEvents: () => void;
  coreState: CoreState;
  flowLabel: string | null;
  currentRunId: string | null;
  // Mission Control B1
  currentPlan: PlanState | null;
  resetPlan: () => void;
  approveStep: (planId: string, stepId: string) => Promise<void>;
  /**
   * Most recent run id seen, even after the run finished. Drives UI surfaces
   * that need to outlive `currentRunId` (action receipts, last-trace links,
   * post-run cost chips).
   */
  lastRunId: string | null;
  /**
   * AbortController du fetch en cours. Non sérialisable — le store n'étant
   * pas persisté c'est safe. `stopRun()` l'invoque pour fermer la connexion
   * SSE côté client. Le backend continue silencieusement (TODO endpoint
   * dédié `/api/orchestrate/abort/[runId]` pour vrai kill serveur).
   */
  abortController: AbortController | null;
  setAbortController: (controller: AbortController | null) => void;
  startRun: (runId: string) => void;
  completeRun: () => void;
  failRun: (error: string) => void;
  stopRun: () => void;
}

const MAX_EVENTS = 50;

export const useRuntimeStore = create<RuntimeState>()(
  subscribeWithSelector((set, get) => ({
    connected: false,
    events: [],
    coreState: "idle",
    flowLabel: null,
    currentRunId: null,
    lastRunId: null,
    abortController: null,
    currentPlan: null,

    setConnected: (connected) => set({ connected }),

    addEvent: (event) => {
      set((state) => {
        const newEvent: StreamEvent = { ...event, timestamp: Date.now() };
        return { events: [newEvent, ...state.events].slice(0, MAX_EVENTS) };
      });

      // Validate run_id consistency
      const eventRunId = event.run_id as string | undefined;
      const currentRunId = get().currentRunId;

      if (eventRunId && currentRunId && eventRunId !== currentRunId) {
        // Allow transition from client token to canonical run_id
        if (!currentRunId.startsWith("run_")) {
          console.log(`[RuntimeStore] Transitioning run_id: ${currentRunId} -> ${eventRunId}`);
        } else {
          console.warn(`[RuntimeStore] Run ID mismatch in event ${event.type}: current=${currentRunId}, event=${eventRunId}`);
        }
      }

      if (eventRunId && !currentRunId) {
        console.warn(`[RuntimeStore] Event ${event.type} arrived with run_id ${eventRunId} but no current run`);
      }

      switch (event.type) {
        case "run_started":
          if (!eventRunId) {
            console.error("[RuntimeStore] run_started event missing run_id");
          }
          set({
            coreState: "streaming",
            currentRunId: eventRunId || currentRunId,
            lastRunId: eventRunId || currentRunId,
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
        case "asset_generated": {
          const ev = event as Record<string, unknown>;
          const assetId = ev.asset_id as string | undefined;
          const assetName = (ev.name as string | undefined) ?? "Rapport";
          const assetType = (ev.asset_type as string | undefined) ?? "report";
          const threadId = useNavigationStore.getState().activeThreadId;
          if (assetId && threadId) {
            useNavigationStore.getState().attachAssetToLastAssistantMessage(threadId, {
              id: assetId,
              title: assetName,
              type: assetType,
            });
          }
          break;
        }
        // ── Mission Control B1 — plan lifecycle ───────────────
        case "plan_preview": {
          const ev = event as Record<string, unknown>;
          const steps = (ev.steps as Array<{ id: string; kind: string; title: string }> | undefined) ?? [];
          set({
            currentPlan: {
              id: ev.plan_id as string,
              intent: (ev.intent as string) ?? "",
              steps: steps.map((s) => ({
                id: s.id,
                kind: s.kind,
                label: s.title,
                status: "idle" as PlanStepStatus,
              })),
              estimatedCostUsd: (ev.estimatedCostUsd as number) ?? 0,
              totalCostUsd: 0,
              requiredApps: (ev.requiredApps as string[] | undefined) ?? [],
              status: "preview",
            },
          });
          break;
        }
        case "plan_step_started": {
          const ev = event as Record<string, unknown>;
          const planId = ev.plan_id as string;
          const stepId = ev.step_id as string;
          const plan = get().currentPlan;
          if (!plan || plan.id !== planId) break;
          set({
            currentPlan: {
              ...plan,
              status: "running",
              steps: plan.steps.map((s) =>
                s.id === stepId
                  ? { ...s, status: "running", startedAt: (ev.plannedAt as number) ?? Date.now() }
                  : s,
              ),
            },
          });
          break;
        }
        case "plan_step_completed": {
          const ev = event as Record<string, unknown>;
          const planId = ev.plan_id as string;
          const stepId = ev.step_id as string;
          const plan = get().currentPlan;
          if (!plan || plan.id !== planId) break;
          const cost = (ev.costUSD as number) ?? 0;
          set({
            currentPlan: {
              ...plan,
              totalCostUsd: Number((plan.totalCostUsd + cost).toFixed(4)),
              steps: plan.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      status: "done",
                      output: ev.output as string | undefined,
                      costUSD: cost,
                      latencyMs: ev.latencyMs as number | undefined,
                      providerId: ev.providerId as string | undefined,
                      completedAt: Date.now(),
                    }
                  : s,
              ),
            },
          });
          break;
        }
        case "plan_step_awaiting_approval": {
          const ev = event as Record<string, unknown>;
          const planId = ev.plan_id as string;
          const stepId = ev.step_id as string;
          const plan = get().currentPlan;
          if (!plan || plan.id !== planId) break;
          set({
            coreState: "awaiting_approval",
            flowLabel: "Validation requise",
            currentPlan: {
              ...plan,
              status: "awaiting_approval",
              steps: plan.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      status: "awaiting_approval",
                      approvalPreview: ev.preview as string | undefined,
                      providerId: ev.providerId as string | undefined,
                    }
                  : s,
              ),
            },
          });
          break;
        }
        case "plan_step_failed": {
          const ev = event as Record<string, unknown>;
          const planId = ev.plan_id as string;
          const stepId = ev.step_id as string;
          const plan = get().currentPlan;
          if (!plan || plan.id !== planId) break;
          set({
            currentPlan: {
              ...plan,
              status: "failed",
              steps: plan.steps.map((s) =>
                s.id === stepId
                  ? { ...s, status: "error", error: ev.error as string | undefined }
                  : s,
              ),
            },
          });
          break;
        }
        case "plan_run_complete": {
          const ev = event as Record<string, unknown>;
          const plan = get().currentPlan;
          if (!plan || plan.id !== ev.plan_id) break;
          set({
            currentPlan: {
              ...plan,
              status: "completed",
              totalCostUsd: (ev.totalCostUsd as number) ?? plan.totalCostUsd,
            },
          });
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
              provider: (focalData.provider ?? focalData.providerId) as string | undefined,
              createdAt: (focalData.createdAt as number) ?? Date.now(),
              updatedAt: (focalData.updatedAt as number) ?? Date.now(),
              // Métadonnées focales canoniques pour traçabilité et actions
              threadId: (focalData.threadId as string) ?? undefined,
              sourcePlanId: (focalData.sourcePlanId as string) ?? undefined,
              sourceAssetId: (focalData.sourceAssetId as string) ?? undefined,
              missionId: (focalData.missionId as string) ?? undefined,
              morphTarget: focalData.morphTarget === null ? null : (focalData.morphTarget as string) ?? undefined,
              primaryAction: focalData.primaryAction && typeof focalData.primaryAction === "object"
                ? {
                    kind: (focalData.primaryAction as Record<string, string>).kind,
                    label: (focalData.primaryAction as Record<string, string>).label,
                  }
                : undefined,
            });
          }
          break;
      }
    },

    clearEvents: () => set({ events: [] }),

    setAbortController: (controller) => set({ abortController: controller }),

    startRun: (runId) =>
      set({ coreState: "streaming", currentRunId: runId, lastRunId: runId, connected: true, currentPlan: null }),
    completeRun: () => set({ coreState: "idle", currentRunId: null, flowLabel: null, abortController: null }),
    resetPlan: () => set({ currentPlan: null }),
    approveStep: async (planId: string, stepId: string) => {
      // POURQUOI : POST côté backend pour reprendre l'exécution. Endpoint
      // dédié `/api/v2/missions/[id]/approve-step`. La réponse stream est
      // consommée silencieusement — les events SSE arrivent via le run.
      try {
        const res = await fetch(`/api/v2/missions/${planId}/approve-step`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId }),
        });
        if (!res.ok) {
          console.warn(`[runtime] approveStep failed: ${res.status}`);
        }
      } catch (err) {
        console.error("[runtime] approveStep error:", err);
      }
    },
    failRun: (error) => set({ coreState: "error", flowLabel: error, abortController: null }),
    stopRun: () => {
      const controller = get().abortController;
      const runId = get().currentRunId;
      // B2 : POST l'endpoint d'abort AVANT de fermer le SSE local — sinon
      // le serveur continue à tourner (et à payer le LLM) jusqu'à
      // completion ou maxDuration. Fire-and-forget : on n'attend pas la
      // réponse pour rendre la main UI immédiatement.
      if (runId) {
        void fetch(`/api/orchestrate/abort/${encodeURIComponent(runId)}`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      set({ coreState: "idle", flowLabel: "Annulé", currentRunId: null, abortController: null });
      // Fade le label "Annulé" après 1.5s pour ne pas polluer la strip.
      setTimeout(() => {
        if (get().coreState === "idle" && get().flowLabel === "Annulé") {
          set({ flowLabel: null });
        }
      }, 1500);
    },
  }))
);


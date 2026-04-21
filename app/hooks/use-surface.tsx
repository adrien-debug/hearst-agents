"use client";

/**
 * useSurface — React context for the chat-first surface model.
 *
 * Provides:
 *   - operating mode (not pages)
 *   - intent flow stage tracking with automatic mode derivation
 *   - connection interrupt (inline, not a panel destination)
 *   - mission lifecycle (propose → activate → adjust)
 *   - resume callback after OAuth
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  surfaceReducer,
  createInitialSurfaceState,
  type SurfaceFullState,
  type OperatingMode,
  type IntentFlowStage,
  type RestorableSessionState,
} from "@/app/lib/surface-state";
import type { ProviderId } from "@/lib/providers/types";

// ── Context value ───────────────────────────────────────────

export interface SurfaceContextValue {
  state: SurfaceFullState;

  // Mode
  setMode: (mode: OperatingMode, context?: Record<string, unknown>) => void;

  // Intent flow
  setIntentStage: (stage: IntentFlowStage, missionId?: string) => void;

  // Connection interrupt
  interruptForConnection: (providerId: ProviderId, capability: string, pendingIntent: string) => void;
  connectionCompleted: () => void;

  // Mission lifecycle
  proposeMission: (intent: string, schedule?: string, target?: string, outputKind?: string) => void;
  activateMission: (missionId: string) => void;
  adjustMission: (missionId: string) => void;
  closeMission: () => void;

  // Session restoration
  restoreSession: (session: RestorableSessionState | null) => void;

  // Reset
  reset: () => void;

  // Derived
  panelMode: OperatingMode;
  isConnectionInterrupted: boolean;
  pendingResumeIntent: string | null;
  hasMission: boolean;
}

const SurfaceCtx = createContext<SurfaceContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────

export function SurfaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(surfaceReducer, undefined, createInitialSurfaceState);

  const setMode = useCallback((mode: OperatingMode, context?: Record<string, unknown>) => {
    dispatch({ type: "set_mode", mode, context });
  }, []);

  const setIntentStage = useCallback((stage: IntentFlowStage, missionId?: string) => {
    dispatch({ type: "set_intent_stage", stage, missionId });
  }, []);

  const interruptForConnection = useCallback((providerId: ProviderId, capability: string, pendingIntent: string) => {
    dispatch({ type: "interrupt_for_connection", providerId, capability, pendingIntent });
  }, []);

  const connectionCompleted = useCallback(() => {
    dispatch({ type: "connection_completed" });
  }, []);

  const proposeMission = useCallback((intent: string, schedule?: string, target?: string, outputKind?: string) => {
    dispatch({ type: "propose_mission", intent, schedule, target, outputKind });
  }, []);

  const activateMission = useCallback((missionId: string) => {
    dispatch({ type: "activate_mission", missionId });
  }, []);

  const adjustMission = useCallback((missionId: string) => {
    dispatch({ type: "adjust_mission", missionId });
  }, []);

  const closeMission = useCallback(() => {
    dispatch({ type: "close_mission" });
  }, []);

  const restoreSession = useCallback((session: RestorableSessionState | null) => {
    dispatch({ type: "restore_session", session });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const value = useMemo<SurfaceContextValue>(() => ({
    state,
    setMode,
    setIntentStage,
    interruptForConnection,
    connectionCompleted,
    proposeMission,
    activateMission,
    adjustMission,
    closeMission,
    restoreSession,
    reset,
    panelMode: state.rightPanel.mode,
    isConnectionInterrupted: state.intentFlow.connectionInterrupt !== null,
    pendingResumeIntent: state.intentFlow.connectionInterrupt?.pendingIntent ?? null,
    hasMission: state.mission !== null,
  }), [
    state,
    setMode,
    setIntentStage,
    interruptForConnection,
    connectionCompleted,
    proposeMission,
    activateMission,
    adjustMission,
    closeMission,
    restoreSession,
    reset,
  ]);

  return (
    <SurfaceCtx.Provider value={value}>
      {children}
    </SurfaceCtx.Provider>
  );
}

// ── Hooks ───────────────────────────────────────────────────

export function useSurface(): SurfaceContextValue {
  const ctx = useContext(SurfaceCtx);
  if (!ctx) throw new Error("useSurface must be used within SurfaceProvider");
  return ctx;
}

export function useSurfaceOptional(): SurfaceContextValue | null {
  return useContext(SurfaceCtx);
}

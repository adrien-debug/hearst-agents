/**
 * @deprecated Legacy client mission React context + hooks.
 * Canonical mission system: lib/runtime/missions/*, /api/v2/missions*.
 * Still used by ControlPanel (v1 mission panel) and layout.tsx (MissionProvider).
 */
"use client";

import { createContext, useContext, useSyncExternalStore, useCallback, useMemo, type ReactNode } from "react";
import type { Surface, MissionEvent, MissionSnapshot } from "./types";
import { MissionRegistry, getMissionRegistry } from "./registry";

/* ─── SSR fallback (stable reference) ─── */

const EMPTY_SNAPSHOT: MissionSnapshot = {
  missions: [],
  activeMissionId: null,
  activeSurface: "home",
};

/* ─── Context ─── */

const RegistryContext = createContext<MissionRegistry | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => getMissionRegistry(), []);
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

/* ─── Hook ─── */

function useRegistry(): MissionRegistry {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error("useMission must be used within MissionProvider");
  return ctx;
}

export function useMission() {
  const registry = useRegistry();

  const subscribe = useCallback(
    (cb: () => void) => registry.subscribe(cb),
    [registry],
  );

  const getSnapshot = useCallback(
    () => registry.getSnapshot(),
    [registry],
  );

  const getServerSnapshot = useCallback(
    () => EMPTY_SNAPSHOT,
    [],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const activeMission = snapshot.activeMissionId
    ? snapshot.missions.find((m) => m.id === snapshot.activeMissionId) ?? null
    : null;

  const backgroundMissions = snapshot.missions.filter(
    (m) => m.id !== snapshot.activeMissionId && (m.status === "running" || m.status === "awaiting_approval"),
  );

  const dispatch = useCallback(
    (event: MissionEvent) => registry.dispatch(event),
    [registry],
  );

  const setActiveSurface = useCallback(
    (surface: Surface) => registry.setActiveSurface(surface),
    [registry],
  );

  const setActiveMission = useCallback(
    (id: string | null) => registry.setActiveMission(id),
    [registry],
  );

  const dismissMission = useCallback(
    (id: string) => registry.dispatch({ type: "mission_dismissed", missionId: id }),
    [registry],
  );

  return {
    activeMission,
    backgroundMissions,
    allMissions: snapshot.missions,
    activeSurface: snapshot.activeSurface,
    dispatch,
    setActiveSurface,
    setActiveMission,
    dismissMission,
  };
}

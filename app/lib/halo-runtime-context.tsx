"use client";

/**
 * Single Halo runtime view for the authenticated shell.
 * OrchestrationHalo and ManifestationStage must share one reducer + SSE wiring.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useHalo, type UseHaloResult } from "@/app/hooks/use-halo";

const HaloRuntimeContext = createContext<UseHaloResult | null>(null);

export function HaloRuntimeProvider({ children }: { children: ReactNode }) {
  const halo = useHalo();
  return <HaloRuntimeContext.Provider value={halo}>{children}</HaloRuntimeContext.Provider>;
}

export function useHaloRuntime(): UseHaloResult {
  const v = useContext(HaloRuntimeContext);
  if (!v) {
    throw new Error("useHaloRuntime must be used within HaloRuntimeProvider");
  }
  return v;
}

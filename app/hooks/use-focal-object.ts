/**
 * useFocalObject — Resolves the active focal object for the right panel.
 *
 * Bridges surface-state, planner, missions, and assets into a single
 * FocalObject that the right panel renders.
 *
 * Resolution priority:
 * 1. Surface context with explicit plan/mission/asset
 * 2. Thread-scoped plans (approval > executing > completed)
 * 3. Thread-scoped assets (latest)
 * 4. Thread-scoped active missions
 * 5. null (idle)
 *
 * Secondary objects: max 2, softened, from historical assets/missions.
 */

import { useMemo } from "react";
import { useSurfaceOptional } from "@/app/hooks/use-surface";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import type { FocalObject } from "@/lib/right-panel/objects";
import {
  resolveFocalObject,
  manifestPlan,
  manifestMission,
  manifestAsset,
} from "@/lib/right-panel/manifestation";
import { getPlansForThread } from "@/lib/planner/store";
import { getMissionsForThread } from "@/lib/planner/store";
import { getAssetsForThread } from "@/lib/assets/types";

const MAX_SECONDARY = 2;

export interface FocalObjectState {
  focal: FocalObject | null;
  secondary: FocalObject[];
  /** True when the panel should be in focused mode (has a focal object). */
  isFocused: boolean;
}

export function useFocalObject(): FocalObjectState {
  const surface = useSurfaceOptional();
  const sidebar = useSidebarOptional();
  const threadId = sidebar?.state.activeThreadId;

  return useMemo(() => {
    if (!threadId) {
      return { focal: null, secondary: [], isFocused: false };
    }

    const plans = getPlansForThread(threadId);
    const missions = getMissionsForThread(threadId);
    const assets = getAssetsForThread(threadId);

    const focal = resolveFocalObject(plans, missions, assets);

    // Secondary: other manifestable objects, excluding the focal one
    const secondary: FocalObject[] = [];

    // Add recent assets (excluding the one already focal)
    for (let i = assets.length - 1; i >= 0 && secondary.length < MAX_SECONDARY; i--) {
      const obj = manifestAsset(assets[i]);
      if (obj && obj.id !== focal?.id) {
        secondary.push(obj);
      }
    }

    // Add active missions not already focal
    for (const m of missions) {
      if (secondary.length >= MAX_SECONDARY) break;
      if (m.status !== "active") continue;
      const obj = manifestMission(m);
      if (obj.id !== focal?.id) {
        secondary.push(obj);
      }
    }

    return {
      focal,
      secondary: secondary.slice(0, MAX_SECONDARY),
      isFocused: focal !== null,
    };
  }, [threadId, surface?.state.surface.mode, surface?.state.surface.context]);
}

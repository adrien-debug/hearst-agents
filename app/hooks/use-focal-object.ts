/**
 * useFocalObject — Resolves the active focal object for the right panel.
 *
 * Resolution priority:
 * 1. Live focal object from SSE (focal_object_ready event)
 * 2. Surface context with explicit plan/mission/asset
 * 3. Thread-scoped plans (approval > executing > completed)
 * 4. Thread-scoped assets (latest)
 * 5. Thread-scoped active missions
 * 6. null (idle)
 *
 * Secondary objects: max 2, softened, from historical assets/missions.
 */

import { useMemo } from "react";
import { useSurfaceOptional } from "@/app/hooks/use-surface";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import type { FocalObject } from "@/lib/right-panel/objects";
import {
  resolveFocalObject,
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
  const { data } = useRightPanel();
  const threadId = sidebar?.state.activeThreadId;

  return useMemo(() => {
    // Live focal object from SSE takes priority
    if (data.focalObject && data.focalObject.objectType) {
      const liveFocal = data.focalObject as unknown as FocalObject;
      const pollSecondary: FocalObject[] = (data.secondaryObjects ?? [])
        .filter((o) => o.objectType && o.id !== liveFocal.id)
        .map((o) => o as unknown as FocalObject)
        .slice(0, MAX_SECONDARY);
      return { focal: liveFocal, secondary: pollSecondary, isFocused: true };
    }

    if (!threadId) {
      return { focal: null, secondary: [], isFocused: false };
    }

    const plans = getPlansForThread(threadId);
    const missions = getMissionsForThread(threadId);
    const assets = getAssetsForThread(threadId);

    const focal = resolveFocalObject(plans, missions, assets);

    const secondary: FocalObject[] = [];

    for (let i = assets.length - 1; i >= 0 && secondary.length < MAX_SECONDARY; i--) {
      const obj = manifestAsset(assets[i]);
      if (obj && obj.id !== focal?.id) {
        secondary.push(obj);
      }
    }

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
  }, [threadId, surface?.state.surface.mode, surface?.state.surface.context, data.focalObject]);
}

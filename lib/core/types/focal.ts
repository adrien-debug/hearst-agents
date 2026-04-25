/**
 * Focal Object Utilities — Core mapping and type guards
 *
 * Canonical location: lib/core/types/focal.ts
 * Part of Architecture Finale — Type Unification layer.
 *
 * Centralizes focal object transformations to prevent drift between
 * RightPanel, FocalStage, and other consumers.
 */

import type { FocalObject, FocalType, FocalStatus } from "@/stores/focal";

export interface FocalMappingOptions {
  fallbackThreadId: string;
  /** Include debug info in mapped object (dev only) */
  debug?: boolean;
}

/**
 * Maps an unknown API response object to a typed FocalObject.
 * Used by RightPanel and other consumers to normalize API data.
 *
 * Architecture Finale alignment: This utility bridges the gap between
 * server-side manifest types (lib/right-panel/objects.ts) and client
 * canonical types (stores/focal.ts). Phase 7 will eliminate the duplication.
 */
export function mapFocalObject(
  obj: unknown,
  fallbackThreadId: string
): FocalObject | null {
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  const objectType = (o.objectType ?? o.type) as string | undefined;
  if (!objectType) return null;

  return {
    id: (o.id as string) || `focal-${Date.now()}`,
    type: objectType as FocalType,
    status: (o.status as FocalStatus) || "ready",
    title: (o.title as string) || "Untitled",
    body: (o.body as string) || (o.summary as string) || "",
    summary: (o.summary as string) || undefined,
    sections: Array.isArray(o.sections)
      ? (o.sections as { heading?: string; body: string }[])
      : undefined,
    threadId: (o.threadId as string) || fallbackThreadId,
    sourcePlanId: (o.sourcePlanId as string) || undefined,
    sourceAssetId: (o.sourceAssetId as string) || undefined,
    missionId: (o.missionId as string) || undefined,
    morphTarget:
      o.morphTarget === null
        ? null
        : (o.morphTarget as string) || undefined,
    primaryAction:
      o.primaryAction && typeof o.primaryAction === "object"
        ? {
            kind: (o.primaryAction as Record<string, string>).kind,
            label: (o.primaryAction as Record<string, string>).label,
          }
        : undefined,
    createdAt:
      typeof o.createdAt === "number" ? o.createdAt : Date.now(),
    updatedAt:
      typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
  };
}

/**
 * Maps an array of unknown objects to FocalObjects, filtering out nulls.
 */
export function mapFocalObjects(
  objs: unknown[],
  fallbackThreadId: string
): FocalObject[] {
  return objs
    .map((obj) => mapFocalObject(obj, fallbackThreadId))
    .filter((f): f is FocalObject => f !== null);
}

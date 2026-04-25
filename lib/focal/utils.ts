/**
 * Focal Object Utilities — Shared mapping and type guards
 *
 * Centralizes focal object transformations to prevent drift between
 * RightPanel, FocalStage, and other consumers.
 */

import type { FocalObject, FocalType, FocalStatus } from "@/stores/focal";

/**
 * Maps an unknown API response object to a typed FocalObject.
 * Used by RightPanel and other consumers to normalize API data.
 */
export function mapFocalObject(
  obj: unknown,
  fallbackThreadId: string
): FocalObject | null {
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  const objectType = o.objectType as string | undefined;
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

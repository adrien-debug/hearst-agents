/**
 * Focal Object Utilities — Core mapping and type guards
 *
 * Canonical location: lib/core/types/focal.ts
 * Part of Architecture Finale — Type Unification layer.
 *
 * Centralizes focal object transformations to prevent drift between
 * RightPanel, FocalStage, HomePage rehydration, and other consumers.
 */

import type { FocalObject, FocalType, FocalStatus } from "@/stores/focal";

const VALID_FOCAL_TYPES: FocalType[] = [
  "message_draft",
  "message_receipt",
  "brief",
  "outline",
  "report",
  "doc",
  "watcher_draft",
  "watcher_active",
  "mission_draft",
  "mission_active",
];

const VALID_FOCAL_STATUSES: FocalStatus[] = [
  "composing",
  "ready",
  "awaiting_approval",
  "delivering",
  "delivered",
  "active",
  "paused",
  "failed",
];

export interface FocalMappingOptions {
  fallbackThreadId: string;
  /** Include debug info in mapped object (dev only) */
  debug?: boolean;
}

/**
 * Maps an unknown API response object to a typed FocalObject.
 * Used by RightPanel, FocalStage, thread rehydration, and other consumers.
 */
export function mapFocalObject(
  obj: unknown,
  fallbackThreadId: string
): FocalObject | null {
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  const objectType = (o.objectType ?? o.type) as string | undefined;
  if (!objectType) return null;

  const type = VALID_FOCAL_TYPES.includes(objectType as FocalType)
    ? (objectType as FocalType)
    : "brief";

  const status = VALID_FOCAL_STATUSES.includes(o.status as FocalStatus)
    ? (o.status as FocalStatus)
    : "ready";

  let body = (o.body as string) || (o.summary as string) || "";
  if (!body && Array.isArray(o.sections) && o.sections.length > 0) {
    const firstSection = o.sections[0] as Record<string, string>;
    body = firstSection?.body || "";
  }

  let primaryAction: { kind: string; label: string } | undefined;
  if (o.primaryAction && typeof o.primaryAction === "object") {
    const pa = o.primaryAction as Record<string, unknown>;
    if (typeof pa.kind === "string" && typeof pa.label === "string") {
      primaryAction = { kind: pa.kind, label: pa.label };
    }
  }

  const createdAt =
    typeof o.createdAt === "number" ? o.createdAt : Date.now();
  const updatedAt =
    typeof o.updatedAt === "number" ? o.updatedAt : Date.now();

  return {
    id: (o.id as string) || `focal-${Date.now()}`,
    type,
    status,
    title: (o.title as string) || "Untitled",
    body,
    summary: (o.summary as string) || undefined,
    sections: Array.isArray(o.sections)
      ? (o.sections as { heading?: string; body: string }[])
      : undefined,
    wordCount: typeof o.wordCount === "number" ? o.wordCount : undefined,
    provider: (o.providerId as string) || (o.provider as string) || undefined,
    createdAt,
    updatedAt,
    threadId: (o.threadId as string) || fallbackThreadId,
    sourcePlanId: (o.sourcePlanId as string) || undefined,
    sourceAssetId: (o.sourceAssetId as string) || undefined,
    missionId: (o.missionId as string) || undefined,
    morphTarget:
      o.morphTarget === null
        ? null
        : (o.morphTarget as string) || undefined,
    primaryAction,
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

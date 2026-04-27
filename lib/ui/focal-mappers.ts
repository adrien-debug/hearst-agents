/**
 * Focal mappers — single source of truth for {Mission|Asset} → FocalObject.
 *
 * The chat home page, the dedicated /missions and /assets pages, and the
 * right panel previews all need to translate the same domain shapes into
 * a `FocalObject` that the focal stage can render. Before this module they
 * had divergent copies of the helper that started to drift on `summary`
 * formatting. Centralising avoids that bug class.
 *
 * Both functions accept a *Like type that is the **union** of the fields
 * any caller might have. Callers pass what they have; the mapper picks the
 * right field with sensible fallbacks.
 */

import type { FocalObject } from "@/stores/focal";

// ── Mission ──────────────────────────────────────────────────

export interface MissionLike {
  id: string;
  name: string;
  enabled?: boolean;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
  /** Body shown on the focal — preferred over `description`. */
  input?: string;
  description?: string;
  /** Human-readable schedule label ("daily 9am", "weekly Mon", …). */
  schedule?: string;
  /** Frequency token ("daily", "weekly", "custom", …). */
  frequency?: string;
  /** Last run as ISO string (page) or epoch ms (right panel). */
  lastRun?: string | null;
  lastRunAt?: number | null;
}

function formatLastRun(m: MissionLike): string {
  if (m.lastRunAt) {
    return `Last run: ${new Date(m.lastRunAt).toLocaleString()}`;
  }
  if (m.lastRun) {
    return `Last run: ${m.lastRun}`;
  }
  return "Never run";
}

function focalStatus(m: MissionLike): FocalObject["status"] {
  if (m.opsStatus === "running") return "active";
  if (m.opsStatus === "failed") return "failed";
  return m.enabled ? "ready" : "paused";
}

export function missionToFocal(mission: MissionLike, threadId: string | null): FocalObject {
  const now = Date.now();
  const scheduleLabel = mission.schedule ?? mission.frequency ?? "—";
  const summary = [
    `Schedule: ${scheduleLabel}`,
    formatLastRun(mission),
    mission.enabled ? "Armed" : "Disabled",
  ].join(" · ");

  return {
    id: mission.id,
    type: mission.enabled ? "mission_active" : "mission_draft",
    status: focalStatus(mission),
    title: mission.name,
    body: mission.input ?? mission.description ?? "",
    summary,
    missionId: mission.id,
    threadId: threadId ?? undefined,
    createdAt: now,
    updatedAt: mission.lastRunAt ?? now,
    primaryAction: mission.enabled
      ? { kind: "pause", label: "Pause mission" }
      : { kind: "resume", label: "Resume mission" },
  };
}

// ── Asset ────────────────────────────────────────────────────

export interface AssetLike {
  id: string;
  name: string;
  type: string;
  /** Bytes, optional (right panel doesn't track it). */
  size?: number;
}

const ASSET_TYPE_MAP: Record<string, FocalObject["type"]> = {
  report: "report",
  brief: "brief",
  document: "doc",
  doc: "doc",
  message: "message_receipt",
  plan: "outline",
  synthesis: "report",
};

export function assetToFocal(asset: AssetLike, threadId: string | null): FocalObject {
  const now = Date.now();
  const focalType = ASSET_TYPE_MAP[asset.type.toLowerCase()] ?? "doc";
  const sizeChunk =
    typeof asset.size === "number" && asset.size > 0
      ? ` · ${(asset.size / 1024).toFixed(1)} KB`
      : "";
  return {
    id: asset.id,
    type: focalType,
    status: "ready",
    title: asset.name,
    summary: `Asset · ${asset.type.toUpperCase()}${sizeChunk}`,
    sourceAssetId: asset.id,
    threadId: threadId ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

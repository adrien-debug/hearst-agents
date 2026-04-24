/**
 * Core Types — Canonical type exports for Hearst OS.
 *
 * This module provides a unified entry point for the most frequently used
 * types across the application. It re-exports types from their original
 * locations to maintain backward compatibility while reducing import
 * fragmentation.
 *
 * Migration strategy:
 * - New code should import from `@/lib/core/types`
 * - Existing imports remain valid (non-breaking)
 * - Types are not duplicated, only re-exported
 */

// ── Navigation & Thread System ──────────────────────────────
export type {
  Surface,
  Message,
  Thread,
} from "@/stores/navigation";

// ── Focal Object System ─────────────────────────────────────
export type {
  FocalType,
  FocalStatus,
  FocalObject,
} from "@/stores/focal";

// ── Runtime & Streaming ────────────────────────────────────
export type {
  StreamEvent,
  CoreState,
} from "@/stores/runtime";

// ── Assets ──────────────────────────────────────────────────
export type {
  AssetKind,
  AssetProvenance,
  Asset,
} from "@/lib/assets/types";

// ── Right Panel (UI View Model) ─────────────────────────────
export type {
  RightPanelCurrentRun,
  RightPanelRun,
  RightPanelAsset,
  RightPanelMission,
  RightPanelData,
  FocalObjectView,
} from "@/lib/ui/right-panel/types";

// ── Runs ────────────────────────────────────────────────────
export type {
  RunStatus,
  RunAssetRef,
  RunRecord,
} from "@/lib/runtime/runs/types";

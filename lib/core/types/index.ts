/**
 * Core Types — Canonical type exports for Hearst OS.
 *
 * Architecture Finale alignment: lib/core/types/ is the single source of truth
 * for all domain types. Re-exports from stores/, engine/, and focal domain.
 *
 * Migration:
 * - New code: import from "@/lib/core/types"
 * - Legacy: existing imports still valid (backward compatible)
 * - Goal: eliminate lib/right-panel/objects.ts duplication (Phase 7)
 */

// ── Navigation & Thread System ──────────────────────────────
export type {
  Surface,
  Message,
  Thread,
} from "@/stores/navigation";

// ── Focal Object System (Canonical) ─────────────────────────
export type {
  FocalType,
  FocalStatus,
  FocalObject,
} from "@/stores/focal";

// ── Focal Utilities ────────────────────────────────────────
export {
  mapFocalObject,
  mapFocalObjects,
  type FocalMappingOptions,
} from "./focal";

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

// ── Right Panel (UI View Model) ────────────────────────────
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

// ── Connectors (Unified) ───────────────────────────────────
export type {
  ServiceDefinition,
  ServiceWithConnectionStatus,
} from "@/lib/integrations/types";

// Note: ConnectorCapability imported from @/lib/connectors/platform/types
// Import directly from there if needed: import type { ConnectorCapability } from "@/lib/connectors/platform/types"

/**
 * Core Types — Canonical type exports for Hearst OS.
 *
 * Architecture Finale alignment: lib/core/types/ is the single source of truth
 * for all domain types. Re-exports from stores/, engine/, and focal domain.
 *
 * Usage: import type { Asset, RunRecord, AgentDefinition } from "@/lib/core/types"
 */

// ── Common ──────────────────────────────────────────────────
export type {
  ApiResponse,
  ProviderId,
  Timestamp,
  PaginatedResult,
  TenantScope,
} from "./common";

// ── Connectors — only Composio + the platform's plug shape remain ─────
export type { ConnectorCapability, ConnectorDefinition } from "@/lib/connectors/platform/types";
export type { DiscoveredTool, ConnectedAccount } from "@/lib/connectors/composio";

// ── Agents ──────────────────────────────────────────────────
export type {
  AgentDefinition,
  AgentBackend,
  AgentBackendDecision,
  AgentBackendV2,
  BackendCapabilities,
  ManagedSessionConfig,
  ManagedSessionContext,
  ManagedAgentEvent,
  ManagedAgentEventType,
  ManagedAgentResult,
  ManagedAgentStep,
  BackendSelectionInput,
  BackendSelectionResult,
  HybridExecutionPlan,
  HybridStep,
  HandoffContext,
  HandoffResult,
  CapabilityAgent,
  StepActor,
} from "./agents";

// ── Runtime ─────────────────────────────────────────────────
export type {
  RunStatus,
  RunAssetRef,
  RunRecord,
  TimelineItemType,
  TimelineSeverity,
  TimelineItem,
  PersistedRunStatus,
  PersistedRunRecord,
  PersistedMissionRunStatus,
  PersistedScheduledMission,
} from "./runtime";

// ── Assets ──────────────────────────────────────────────────
export type {
  AssetKind,
  AssetProvenance,
  Asset,
  ActionType,
  ActionStatus,
  Action,
  AssetType,
  AssetStorageKind,
  AssetFileInfo,
  RuntimeAsset,
  StorageProvider,
  StorageProviderType,
  StorageObject,
  StorageConfig,
  SignedUrlOptions,
  UploadResult,
  DownloadResult,
} from "./assets";

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

// ── Right Panel (UI View Model) ────────────────────────────
export type {
  RightPanelCurrentRun,
  RightPanelRun,
  RightPanelAsset,
  RightPanelMission,
  RightPanelData,
  FocalObjectView,
} from "@/lib/ui/right-panel/types";

// ── Connectors (Unified — legacy re-export) ────────────────
export type {
  ServiceDefinition,
  ServiceWithConnectionStatus,
} from "@/lib/integrations/types";

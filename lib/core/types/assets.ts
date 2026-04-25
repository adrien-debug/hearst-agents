/**
 * Core Types — Assets
 *
 * Canonical re-exports for asset types from both domains:
 * - Thread-scoped assets (lib/assets/types.ts) — UI/focal system
 * - Runtime assets (lib/engine/runtime/assets/types.ts) — file generation
 */

export type {
  AssetKind,
  AssetProvenance,
  Asset,
  ActionType,
  ActionStatus,
  Action,
} from "@/lib/assets/types";

export type {
  AssetType,
  AssetStorageKind,
  AssetFileInfo,
  RuntimeAsset,
} from "@/lib/engine/runtime/assets/types";

export type {
  StorageProvider,
  StorageProviderType,
  StorageObject,
  StorageConfig,
  SignedUrlOptions,
  UploadResult,
  DownloadResult,
} from "@/lib/engine/runtime/assets/storage/types";

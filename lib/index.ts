/**
 * HEARST OS — Master Barrel Export
 *
 * Architecture Finale: single entry point for library imports.
 * Usage: import { type Asset, type RunRecord } from "@/lib"
 *
 * For deeper access, import from submodules directly:
 *   import { generatePdfArtifact } from "@/lib/engine/runtime/assets/generators"
 */

// Core Types
export * from "./core/types";

// Platform
export { authOptions } from "./platform/auth";
export {
  getSettingValue,
  setSettingValue,
  getFeatureFlag,
  setFeatureFlag,
  invalidateSettingsCache,
} from "./platform/settings";

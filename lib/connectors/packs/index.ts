/**
 * Connector Packs — Public API
 *
 * Entry point pour le système de packs.
 * Usage:
 *   import { getPackLoader, loadAllPacks } from "@/lib/connectors/packs";
 */

export * from "./types";
export * from "./manifest";
export {
  PackLoader,
  initPackLoader,
  getPackLoader,
  clearPackLoader,
} from "./loader";

import { getPackLoader as getLoader } from "./loader";

/**
 * Convenience: load all packs with default config
 */
export async function loadAllPacks(): Promise<
  Array<{
    packId: string;
    success: boolean;
    connectors: string[];
    error?: string;
  }>
> {
  const loader = getLoader();
  return loader.loadAll();
}

/**
 * Convenience: get stats
 */
export function getPackStats(): {
  packs: number;
  connectors: number;
  byCategory: Record<string, number>;
} {
  const loader = getLoader();
  return loader.getStats();
}

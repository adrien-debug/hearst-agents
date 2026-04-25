/**
 * Storage Provider — Public API
 *
 * Factory pour instancier le provider selon l'environnement.
 * Usage:
 *   import { createStorageProvider } from "@/lib/engine/runtime/assets/storage";
 *   const storage = createStorageProvider("hybrid", { ... });
 */

import type { StorageProvider, StorageConfig } from "./types";
import { LocalStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";
import { HybridStorageProvider } from "./hybrid";

export * from "./types";
export { LocalStorageProvider } from "./local";
export { R2StorageProvider } from "./r2";
export { HybridStorageProvider } from "./hybrid";

/**
 * Factory — crée le provider approprié selon la config
 */
export function createStorageProvider(
  type: StorageConfig["provider"],
  config: Omit<StorageConfig, "provider">
): StorageProvider {
  switch (type) {
    case "local": {
      if (!config.local) {
        throw new Error("[Storage] Local config required");
      }
      return new LocalStorageProvider({
        basePath: config.local.basePath,
        publicBaseUrl:
          config.local.publicBaseUrl || "http://localhost:9000/assets",
      });
    }

    case "r2": {
      if (!config.r2) {
        throw new Error("[Storage] R2 config required");
      }
      return new R2StorageProvider({
        accountId: config.r2.accountId,
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
        bucket: config.r2.bucket,
        publicUrl: config.r2.publicUrl,
        region: config.r2.region,
      });
    }

    case "hybrid": {
      if (!config.hybrid || !config.local || !config.r2) {
        throw new Error("[Storage] Hybrid requires local + R2 config");
      }

      const hot = new LocalStorageProvider({
        basePath: config.local.basePath,
        publicBaseUrl: "http://localhost:9000", // Internal only for hybrid
      });

      const cold = new R2StorageProvider({
        accountId: config.r2.accountId,
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
        bucket: config.r2.bucket,
        publicUrl: config.r2.publicUrl,
      });

      return new HybridStorageProvider({
        hotProvider: hot,
        coldProvider: cold,
        maxHotSizeBytes: config.hybrid.maxHotSizeBytes,
        maxHotFiles: config.hybrid.maxHotFiles || 1000,
        ttlSeconds: config.hybrid.ttlSeconds,
      });
    }

    default:
      throw new Error(`[Storage] Unknown provider type: ${type}`);
  }
}

/**
 * Singleton pour l'application
 * À initialiser au boot avec les bonnes variables d'environnement
 */
let globalStorage: StorageProvider | null = null;

export function initGlobalStorage(config: StorageConfig): void {
  globalStorage = createStorageProvider(config.provider, config);
}

export function getGlobalStorage(): StorageProvider {
  if (!globalStorage) {
    // Fallback to local dev storage
    console.warn("[Storage] Global storage not initialized, using local dev");
    globalStorage = createStorageProvider("local", {
      local: {
        basePath: ".runtime-assets",
        publicBaseUrl: "http://localhost:9000/assets",
      },
    });
  }
  return globalStorage;
}

export function clearGlobalStorage(): void {
  globalStorage = null;
}

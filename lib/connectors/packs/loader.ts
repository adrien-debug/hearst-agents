/**
 * Connector Packs — Loader
 *
 * Auto-discovery et chargement des packs au boot.
 * Scanne lib/connectors/packs/ pour trouver les manifest.json
 */

import fs from "fs/promises";
import path from "path";
import type {
  PackManifest,
  ConnectorManifest,
  PackLoadResult,
  PackLoaderConfig,
} from "./types";
import { validatePackManifest, checkVersionCompatibility } from "./manifest";

const HEARST_VERSION = "1.0.0"; // Should come from package.json

export class PackLoader {
  private config: PackLoaderConfig;
  private loadedPacks: Map<string, PackManifest> = new Map();
  private loadedConnectors: Map<string, ConnectorManifest> = new Map();

  constructor(config: PackLoaderConfig) {
    this.config = config;
  }

  /**
   * Scan et charge tous les packs
   */
  async loadAll(): Promise<PackLoadResult[]> {
    const results: PackLoadResult[] = [];

    try {
      const entries = await fs.readdir(this.config.packsDirectory, {
        withFileTypes: true,
      });

      const packDirs = entries
        .filter((e) => e.isDirectory() && e.name.endsWith("-pack"))
        .map((e) => e.name);

      console.log(`[PackLoader] Found ${packDirs.length} pack directories`);

      for (const dir of packDirs) {
        const result = await this.loadPack(dir);
        results.push(result);
      }
    } catch (err) {
      console.error(`[PackLoader] Failed to scan packs directory: ${err}`);
    }

    return results;
  }

  /**
   * Charge un pack spécifique
   */
  async loadPack(packDir: string): Promise<PackLoadResult> {
    const packId = packDir;
    const manifestPath = path.join(
      this.config.packsDirectory,
      packDir,
      "manifest.json"
    );

    try {
      // Read manifest
      const raw = await fs.readFile(manifestPath, "utf-8");
      const json = JSON.parse(raw);

      // Validate
      if (this.config.validateManifests) {
        const validation = validatePackManifest(json);
        if (!validation.success) {
          console.error(
            `[PackLoader] Invalid manifest for ${packId}:`,
            validation.errors
          );
          return {
            packId,
            success: false,
            connectors: [],
            error: `Invalid manifest: ${validation.errors.join(", ")}`,
          };
        }
      }

      const manifest = json as PackManifest;

      // Check version compatibility
      if (manifest.minHearstVersion) {
        if (!checkVersionCompatibility(HEARST_VERSION, manifest.minHearstVersion)) {
          return {
            packId,
            success: false,
            connectors: [],
            error: `Requires Hearst ${manifest.minHearstVersion}, running ${HEARST_VERSION}`,
          };
        }
      }

      // Check for duplicate IDs
      if (this.loadedPacks.has(manifest.id)) {
        return {
          packId,
          success: false,
          connectors: [],
          error: `Duplicate pack ID: ${manifest.id}`,
        };
      }

      // Register connectors
      const connectorIds: string[] = [];
      for (const connector of manifest.connectors) {
        if (this.loadedConnectors.has(connector.id)) {
          console.warn(
            `[PackLoader] Connector ${connector.id} already registered, skipping`
          );
          continue;
        }

        this.loadedConnectors.set(connector.id, connector);
        connectorIds.push(connector.id);
      }

      // Register pack
      this.loadedPacks.set(manifest.id, manifest);

      console.log(
        `[PackLoader] Loaded ${packId}: ${connectorIds.length} connectors`
      );

      return {
        packId: manifest.id,
        success: true,
        connectors: connectorIds,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[PackLoader] Failed to load ${packId}: ${error}`);
      return { packId, success: false, connectors: [], error };
    }
  }

  /**
   * Récupère un pack chargé
   */
  getPack(packId: string): PackManifest | undefined {
    return this.loadedPacks.get(packId);
  }

  /**
   * Récupère un connecteur chargé
   */
  getConnector(connectorId: string): ConnectorManifest | undefined {
    return this.loadedConnectors.get(connectorId);
  }

  /**
   * Liste tous les packs chargés
   */
  getAllPacks(): PackManifest[] {
    return Array.from(this.loadedPacks.values());
  }

  /**
   * Liste tous les connecteurs chargés
   */
  getAllConnectors(): ConnectorManifest[] {
    return Array.from(this.loadedConnectors.values());
  }

  /**
   * Recherche connecteurs par catégorie
   */
  getConnectorsByCategory(category: string): ConnectorManifest[] {
    return this.getAllConnectors().filter((c) => c.category === category);
  }

  /**
   * Stats
   */
  getStats(): {
    packs: number;
    connectors: number;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};

    for (const connector of this.loadedConnectors.values()) {
      byCategory[connector.category] =
        (byCategory[connector.category] || 0) + 1;
    }

    return {
      packs: this.loadedPacks.size,
      connectors: this.loadedConnectors.size,
      byCategory,
    };
  }

  /**
   * Clear all loaded packs (for testing)
   */
  clear(): void {
    this.loadedPacks.clear();
    this.loadedConnectors.clear();
  }
}

// Singleton
let globalLoader: PackLoader | null = null;

export function initPackLoader(config: PackLoaderConfig): PackLoader {
  globalLoader = new PackLoader(config);
  return globalLoader;
}

export function getPackLoader(): PackLoader {
  if (!globalLoader) {
    // Default config
    globalLoader = new PackLoader({
      packsDirectory: path.join(process.cwd(), "lib/connectors/packs"),
      autoDiscover: true,
      validateManifests: true,
      enableHotReload: false,
      maxConcurrentHealthChecks: 5,
    });
  }
  return globalLoader;
}

export function clearPackLoader(): void {
  globalLoader = null;
}

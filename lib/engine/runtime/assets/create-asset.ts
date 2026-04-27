/**
 * Asset factory — Creates an Asset record with a unique ID.
 * Tenant scope is required — assets cannot be created without it.
 */

import { randomUUID } from "crypto";
import type { Asset, AssetType } from "./types";

export interface CreateAssetInput {
  type: AssetType;
  name: string;
  run_id: string;
  tenantId: string;
  workspaceId: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export function createAsset(input: CreateAssetInput): Asset {
  return {
    id: randomUUID(),
    type: input.type,
    name: input.name,
    run_id: input.run_id,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    created_at: Date.now(),
    url: input.url,
    metadata: input.metadata,
  };
}

// In-memory store for created assets (for API listing)
const assetStore = new Map<string, Asset>();

export function storeAsset(asset: Asset): void {
  assetStore.set(asset.id, asset);
}

export function getAsset(id: string): Asset | undefined {
  return assetStore.get(id);
}

export function getAllAssets(): Asset[] {
  return Array.from(assetStore.values());
}

/** Drop a single asset from the in-memory store. Called by DELETE API. */
export function evictAsset(id: string): void {
  assetStore.delete(id);
}

/** Wipe every asset from the in-memory store. Server-only cleanup. */
export function clearAllAssets(): void {
  assetStore.clear();
}

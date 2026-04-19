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

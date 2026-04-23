import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { createAsset, storeAsset, getAllAssets } from "@/lib/runtime/assets/create-asset";
import { saveAsset, getAssets as getPersistedAssets } from "@/lib/runtime/assets/adapter";
import type { AssetType } from "@/lib/runtime/assets/types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

// Validation schema for creating an asset
const createAssetSchema = z.object({
  type: z.enum(["pdf", "excel", "doc", "json", "csv", "report", "text"]),
  name: z.string().min(1).max(200),
  run_id: z.string().optional(),
  url: z.string().url().optional(),
  metadata: z.object({}).passthrough().optional(),
});

/**
 * GET /api/v2/assets
 * List all assets for the current user/tenant
 */
export async function GET(_req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    // Canonical source: Supabase persistence
    const persisted = await getPersistedAssets({
      tenantId: DEV_TENANT_ID,
      workspaceId: DEV_WORKSPACE_ID,
      limit: 50,
    });

    if (persisted.length > 0) {
      return NextResponse.json({
        assets: persisted,
        count: persisted.length,
        source: "database",
      });
    }

    // Fallback: in-memory store
    const assets = getAllAssets();
    const filteredAssets = assets.filter(
      (a) => a.tenantId === DEV_TENANT_ID && a.workspaceId === DEV_WORKSPACE_ID
    );

    return NextResponse.json({
      assets: filteredAssets,
      count: filteredAssets.length,
      source: "memory",
    });
  } catch (e) {
    console.error("GET /api/v2/assets: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/v2/assets
 * Create a new asset
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    // Parse request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    // Validate input
    const result = createAssetSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "validation_error", details: result.error.format() },
        { status: 400 }
      );
    }

    const { type, name, run_id, url, metadata } = result.data;

    // Create asset
    const asset = createAsset({
      type,
      name,
      run_id: run_id || `manual-${Date.now()}`,
      tenantId: DEV_TENANT_ID,
      workspaceId: DEV_WORKSPACE_ID,
      url,
      metadata: {
        ...metadata,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      },
    });

    // Store in memory (for backward compatibility)
    storeAsset(asset);

    // Persist to Supabase (canonical source)
    const persisted = await saveAsset(asset);
    if (!persisted) {
      console.warn(`[POST /api/v2/assets] Asset saved in-memory only — Supabase unavailable`);
    }

    console.log(`[POST /api/v2/assets] Created asset: ${asset.id} (${type})`);

    return NextResponse.json({
      asset,
      success: true,
      persisted,
    }, { status: 201 });
  } catch (e) {
    console.error("POST /api/v2/assets: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

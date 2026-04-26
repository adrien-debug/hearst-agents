import { NextRequest, NextResponse } from "next/server";
import { createAsset, storeAsset, getAllAssets } from "@/lib/engine/runtime/assets/create-asset";
import { saveAsset, getAssets as getPersistedAssets } from "@/lib/engine/runtime/assets/adapter";
// Note: AssetType est utilisé implicitement via le z.enum dans createAssetSchema
import { z } from "zod";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

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
 * List all assets for the current user/tenant/workspace scope
 * Query params: offset, limit, type, search
 */
export async function GET(req: NextRequest) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "GET /api/v2/assets" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Parse query params
  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const typeFilter = url.searchParams.get("type");
  const searchQuery = url.searchParams.get("search")?.toLowerCase();

  try {
    // Canonical source: Supabase persistence — scoped to current tenant/workspace
    const persisted = await getPersistedAssets({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: 1000, // Fetch all for filtering
    });

    // Filter by userId if persisted assets have user info
    let filtered = persisted.filter((a) => {
      // If asset has no user info, include it (backward compatibility)
      // If asset has user info, only include if matches current user
      const assetUserId = (a.metadata as Record<string, unknown>)?.createdBy;
      return !assetUserId || assetUserId === scope.userId;
    });

    // Fallback: in-memory store if no persisted assets
    if (filtered.length === 0) {
      const assets = getAllAssets();
      filtered = assets.filter((a) => {
        const tenantMatch = a.tenantId === scope.tenantId;
        const workspaceMatch = a.workspaceId === scope.workspaceId;
        const assetUserId = (a.metadata as Record<string, unknown>)?.createdBy;
        const userMatch = !assetUserId || assetUserId === scope.userId;
        return tenantMatch && workspaceMatch && userMatch;
      });
    }

    // Apply type filter
    if (typeFilter && typeFilter !== "all") {
      filtered = filtered.filter((a) => a.type === typeFilter);
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((a) => {
        const nameMatch = a.name.toLowerCase().includes(searchQuery);
        const descMatch = ((a.metadata as Record<string, unknown>)?.description as string)
          ?.toLowerCase()
          .includes(searchQuery);
        return nameMatch || descMatch;
      });
    }

    const total = filtered.length;
    const paginatedAssets = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      assets: paginatedAssets,
      pagination: {
        offset,
        limit,
        total,
      },
      source: persisted.length > 0 ? "database" : "memory",
      scope: { isDevFallback: scope.isDevFallback },
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
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "POST /api/v2/assets" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
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

  // Create asset scoped to current user/tenant/workspace
  const asset = createAsset({
    type,
    name,
    run_id: run_id || `manual-${Date.now()}`,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    url,
    metadata: {
      ...metadata,
      createdBy: scope.userId,
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

  console.log(`[POST /api/v2/assets] Created asset: ${asset.id} (${type}) for user ${scope.userId.slice(0, 8)}`);

  return NextResponse.json({
    asset,
    success: true,
    persisted,
    scope: { isDevFallback: scope.isDevFallback },
  }, { status: 201 });
}

/**
 * Assets Adapter — Supabase persistence for v2 assets.
 *
 * Bridges the v2 Asset type with the Supabase assets table.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Asset, AssetType } from "./types";

let _raw: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_raw) return _raw;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _raw = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _raw;
}

/**
 * Save an asset to Supabase.
 * Maps v2 Asset to the DB schema.
 */
export async function saveAsset(asset: Asset): Promise<boolean> {
  const sb = db();
  if (!sb) {
    console.warn("[AssetsAdapter] No Supabase client — asset not persisted:", asset.id);
    return false;
  }

  try {
    // Map AssetType to DB kind
    const kind = mapTypeToKind(asset.type);

    const { error } = await sb.from("assets").upsert({
      id: asset.id,
      thread_id: asset.metadata?.threadId ?? "default",
      run_id: asset.run_id,
      kind,
      title: asset.name,
      summary: asset.metadata?.summary as string | undefined,
      content_ref: asset.url,
      output_tier: asset.metadata?.outputTier as string | undefined,
      provenance: {
        tenantId: asset.tenantId,
        workspaceId: asset.workspaceId,
        type: asset.type,
        ...asset.metadata,
      },
      created_at: new Date(asset.created_at).toISOString(),
    });

    if (error) {
      console.error("[AssetsAdapter] saveAsset error:", error.message);
      return false;
    }
    console.log(`[AssetsAdapter] Asset saved: ${asset.id} (${asset.type})`);
    return true;
  } catch (err) {
    console.error("[AssetsAdapter] saveAsset exception:", err);
    return false;
  }
}

/**
 * Get all assets for a tenant/workspace.
 */
export async function getAssets(params?: {
  tenantId?: string;
  workspaceId?: string;
  limit?: number;
}): Promise<Asset[]> {
  const sb = db();
  if (!sb) return [];

  try {
    const query = sb
      .from("assets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(params?.limit ?? 50);

    const { data, error } = await query;
    if (error) {
      console.error("[AssetsAdapter] getAssets error:", error.message);
      return [];
    }

    const assets = (data ?? []).map(toAsset);

    if (params?.tenantId || params?.workspaceId) {
      return assets.filter((asset) => {
        if (params.tenantId && asset.tenantId !== params.tenantId) return false;
        if (params.workspaceId && asset.workspaceId !== params.workspaceId) return false;
        return true;
      });
    }

    return assets;
  } catch (err) {
    console.error("[AssetsAdapter] getAssets exception:", err);
    return [];
  }
}

/**
 * Get asset by ID.
 */
/**
 * Delete an asset from Supabase, scoped to a tenant.
 *
 * Returns the affected row count: 0 means the asset didn't exist (or wasn't
 * in scope for this tenant — same behaviour from the caller's POV).
 *
 * Storage cleanup is intentionally NOT done here: storage is async/eventually
 * consistent and the cleanup worker also handles orphaned blobs. Removing
 * the DB row is enough to make the asset disappear from the user's view.
 */
export async function deleteAssetById(
  id: string,
  scope?: { tenantId?: string; workspaceId?: string },
): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  const sb = db();
  if (!sb) {
    return { ok: false, deletedCount: 0, error: "no_supabase_client" };
  }

  try {
    let query = sb.from("assets").delete({ count: "exact" }).eq("id", id);
    if (scope?.tenantId) {
      query = query.eq("tenant_id", scope.tenantId);
    }
    if (scope?.workspaceId) {
      query = query.eq("workspace_id", scope.workspaceId);
    }
    const { error, count } = await query;
    if (error) {
      console.error("[AssetsAdapter] delete failed:", error.message);
      return { ok: false, deletedCount: 0, error: error.message };
    }
    return { ok: true, deletedCount: count ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, deletedCount: 0, error: message };
  }
}

export async function getAssetById(id: string): Promise<Asset | null> {
  const sb = db();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from("assets")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return toAsset(data);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAsset(row: any): Asset {
  const provenance = (row.provenance ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    type: mapKindToType(row.kind as string, provenance.type as string | undefined),
    name: row.title ?? "Untitled",
    run_id: row.run_id ?? "",
    tenantId: (provenance.tenantId as string) ?? "dev-tenant",
    workspaceId: (provenance.workspaceId as string) ?? "dev-workspace",
    created_at: new Date(row.created_at).getTime(),
    url: row.content_ref,
    metadata: {
      ...provenance,
      summary: row.summary,
      outputTier: row.output_tier,
      threadId: row.thread_id,
    },
  };
}

function mapTypeToKind(type: string): string {
  const mapping: Record<string, string> = {
    pdf: "document",
    excel: "spreadsheet",
    doc: "document",
    json: "document",
    csv: "spreadsheet",
    report: "report",
    text: "message",
  };
  return mapping[type] ?? "document";
}

function mapKindToType(kind: string, originalType?: string): AssetType {
  if (originalType) return originalType as AssetType;
  const mapping: Record<string, AssetType> = {
    document: "pdf",
    spreadsheet: "excel",
    report: "report",
    message: "text",
    brief: "report",
    task: "text",
    event: "text",
  };
  return mapping[kind] ?? "json";
}

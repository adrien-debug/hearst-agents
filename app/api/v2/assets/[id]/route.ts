import { NextRequest, NextResponse } from "next/server";
import { deleteAssetById } from "@/lib/engine/runtime/assets/adapter";
import { evictAssetById, loadAssetById } from "@/lib/assets/types";
import { requireScope } from "@/lib/platform/auth/scope";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { scope, error } = await requireScope({ context: `GET /api/v2/assets/${id}` });
    if (error || !scope) {
      return NextResponse.json({ error: error?.message ?? "not_authenticated" }, { status: error?.status ?? 401 });
    }

    const asset = await loadAssetById(id, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });

    if (!asset) {
      return NextResponse.json({ asset: null }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (e) {
    console.error(`GET /api/v2/assets/${id}: uncaught`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/assets/[id]
 *
 * Hard-deletes the asset row scoped to the caller's tenant/workspace.
 * Storage blob cleanup is left to the cleanup worker (async); the asset
 * disappears from the user's view as soon as the row is gone.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { scope, error } = await requireScope({ context: `DELETE /api/v2/assets/${id}` });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  const result = await deleteAssetById(id, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });

  // Evict du cache V2 in-memory (assetCache dans lib/assets/types.ts).
  evictAssetById(id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "delete_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, dbDeleted: result.deletedCount });
}

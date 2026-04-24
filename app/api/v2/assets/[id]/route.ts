import { NextRequest, NextResponse } from "next/server";
import { getAssetDetail } from "@/lib/runtime/assets/detail";
import { requireScope } from "@/lib/scope";

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

    const asset = await getAssetDetail({
      assetId: id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
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

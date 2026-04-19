import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { getAssetDetail } from "@/lib/runtime/assets/detail";

export const dynamic = "force-dynamic";

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const userId = await getUserId();

    const asset = await getAssetDetail({
      assetId: id,
      tenantId: DEV_TENANT_ID,
      workspaceId: DEV_WORKSPACE_ID,
      userId: userId ?? undefined,
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

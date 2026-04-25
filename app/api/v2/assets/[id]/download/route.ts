import { NextRequest, NextResponse } from "next/server";
import { getAssetDetail } from "@/lib/engine/runtime/assets/detail";
import { readAssetFile } from "@/lib/engine/runtime/assets/file-storage";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { scope, error } = await requireScope({ context: `GET /api/v2/assets/${id}/download` });
    if (error || !scope) {
      return NextResponse.json({ error: error?.message ?? "not_authenticated" }, { status: error?.status ?? 401 });
    }

    const detail = await getAssetDetail({
      assetId: id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    });

    if (!detail) {
      return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
    }

    if (!detail.file?.hasFile || !detail.file.fileName) {
      return NextResponse.json(
        { error: "no_file", message: "This asset does not have a downloadable file" },
        { status: 404 },
      );
    }

    const filePath = (detail.metadata as Record<string, unknown> | undefined)?._filePath as string | undefined;
    if (!filePath) {
      return NextResponse.json(
        { error: "file_path_missing", message: "File path not available" },
        { status: 404 },
      );
    }

    const buffer = readAssetFile(filePath);
    if (!buffer) {
      return NextResponse.json(
        { error: "file_not_found", message: "File no longer exists on disk" },
        { status: 404 },
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": detail.file.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${detail.file.fileName}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    console.error(`GET /api/v2/assets/${id}/download: uncaught`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

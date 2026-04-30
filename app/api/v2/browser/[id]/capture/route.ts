/**
 * POST /api/v2/browser/[id]/capture — Screenshot de la session courante.
 *
 * Récupère un PNG via Browserbase, persiste comme asset (kind=screenshot)
 * et retourne l'URL publique + l'assetId. Idempotent : chaque call crée
 * un nouvel asset (timestamped).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { captureScreenshot } from "@/lib/browser/screenshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const { scope, error } = await requireScope({
    context: "POST /api/v2/browser/[id]/capture",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  if (!id?.trim()) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    return NextResponse.json(
      { error: "browserbase_unavailable" },
      { status: 503 },
    );
  }

  try {
    const result = await captureScreenshot(id, scope);
    return NextResponse.json({
      assetId: result.asset.id,
      url: result.url,
      sizeBytes: result.sizeBytes,
      mimeType: result.mimeType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BrowserCapture] failed:", message);
    return NextResponse.json(
      { error: "capture_failed", message },
      { status: 502 },
    );
  }
}

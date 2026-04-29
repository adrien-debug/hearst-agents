import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { scheduleDailyBriefing, getTodayBriefingKey } from "@/lib/engine/runtime/briefing-scheduler";
import { getRedis } from "@/lib/platform/redis/client";
import { getVariantsForAsset } from "@/lib/assets/variants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const { scope, error: scopeError } = await requireScope({ context: "POST /api/briefing" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  try {
    await scheduleDailyBriefing({
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/briefing]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const { scope, error: scopeError } = await requireScope({ context: "GET /api/briefing" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ status: "not_generated" });
  }

  const key = getTodayBriefingKey(scope.userId);
  const assetId = await redis.get(key).catch(() => null);

  if (!assetId) {
    return NextResponse.json({ status: "not_generated" });
  }

  const variants = await getVariantsForAsset(assetId);
  const audio = variants.find((v) => v.kind === "audio");

  if (!audio) {
    return NextResponse.json({ status: "generating", assetId });
  }

  const status = audio.status === "ready" ? "ready" : audio.status === "failed" ? "failed" : "generating";
  return NextResponse.json({ status, assetId, variant: audio });
}

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getSummary } from "@/lib/memory/conversation-summary";
import { getTodayBriefingKey } from "@/lib/engine/runtime/briefing-scheduler";
import { getRedis } from "@/lib/platform/redis/client";
import { getVariantsForAsset } from "@/lib/assets/variants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { scope, error: scopeError } = await requireScope({ context: "GET /api/v2/briefing" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  const text = await getSummary(scope.userId).catch(() => null);

  let audio: { status: string; url?: string } | null = null;
  const redis = getRedis();
  if (redis) {
    const key = getTodayBriefingKey(scope.userId);
    const assetId = await redis.get(key).catch(() => null);
    if (assetId) {
      const variants = await getVariantsForAsset(assetId).catch(() => []);
      const v = variants.find((v) => v.kind === "audio");
      if (v) {
        audio = {
          status: v.status === "ready" ? "ready" : v.status === "failed" ? "failed" : "generating",
          url: v.status === "ready" ? (v.storageUrl ?? undefined) : undefined,
        };
      }
    }
  }

  return NextResponse.json({ text: text || null, audio, generatedAt: Date.now() });
}

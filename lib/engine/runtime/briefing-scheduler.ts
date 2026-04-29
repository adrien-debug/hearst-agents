import { randomUUID } from "crypto";
import { generateBriefing } from "@/lib/memory/briefing";
import { getRedis } from "@/lib/platform/redis/client";
import { enqueueJob } from "@/lib/jobs/queue";
import { createVariant } from "@/lib/assets/variants";
import { storeAsset, type Asset } from "@/lib/assets/types";
import type { AudioGenInput } from "@/lib/jobs/types";

const BRIEFING_TTL_SECS = 24 * 60 * 60;

function briefingKey(userId: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `briefing:sent:${userId}:${ymd}`;
}

export function getTodayBriefingKey(userId: string): string {
  return briefingKey(userId);
}

export async function scheduleDailyBriefing(params: {
  userId: string;
  tenantId: string;
  workspaceId: string;
}): Promise<void> {
  const { userId, tenantId, workspaceId } = params;
  const redis = getRedis();
  const key = briefingKey(userId);

  if (redis) {
    const existing = await redis.get(key).catch(() => null);
    if (existing) return;
  }

  const briefing = await generateBriefing({ userId });

  const assetId = randomUUID();
  const asset: Asset = {
    id: assetId,
    threadId: `briefing:${userId}`,
    kind: "brief",
    title: `Briefing matinal — ${new Date().toLocaleDateString("fr-FR")}`,
    summary: briefing.text,
    provenance: {
      providerId: "system",
      tenantId,
      workspaceId,
      userId,
      runArtifact: true,
    },
    createdAt: Date.now(),
  };
  storeAsset(asset);

  if (briefing.audioScript.trim().length > 0) {
    const variantId = await createVariant({
      assetId,
      kind: "audio",
      status: "pending",
      provider: "elevenlabs",
    });

    if (variantId) {
      const payload: AudioGenInput & { variantId: string } = {
        jobKind: "audio-gen",
        userId,
        tenantId,
        workspaceId,
        assetId,
        estimatedCostUsd: 0.01,
        text: briefing.audioScript,
        variantKind: "audio",
        variantId,
      };

      await enqueueJob(payload).catch((err) => {
        console.warn("[briefing-scheduler] enqueue échoué (Redis indisponible):", err);
      });
    }
  }

  if (redis) {
    await redis.set(key, assetId, "EX", BRIEFING_TTL_SECS).catch(() => {});
  }
}

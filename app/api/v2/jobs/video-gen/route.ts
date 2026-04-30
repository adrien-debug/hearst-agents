/**
 * POST /api/v2/jobs/video-gen
 *
 * Lance une génération vidéo (worker `video-gen`, provider Runway Gen-3
 * par défaut, HeyGen optionnel). Crée un asset placeholder + variant video
 * pending immédiatement. Le client poll
 * GET /api/v2/jobs/[jobId]/status?kind=video-gen.
 *
 * Body : { prompt: string, durationSeconds?: 5|10, provider?, threadId? }
 * Return : { jobId, assetId, variantId, status: "pending" }
 *
 * Sans clé provider correspondante → 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { storeAsset } from "@/lib/assets/types";
import { createVariant, updateVariant } from "@/lib/assets/variants";
import { enqueueJob } from "@/lib/jobs/queue";
import { requireCreditsForJob, formatInsufficientCreditsMessage } from "@/lib/credits/middleware";
import { settleCredits } from "@/lib/credits/client";
import type { VideoGenInput } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  durationSeconds: z.union([z.literal(5), z.literal(10)]).optional(),
  provider: z.enum(["runway", "heygen"]).optional(),
  threadId: z.string().optional(),
});

// Runway Gen-3 ~ $0.05/s ; HeyGen ~ $0.10/s. Estimate prudent.
const COST_PER_SECOND_USD = 0.10;

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { prompt, durationSeconds, provider, threadId } = parsed.data;
  const resolvedProvider = provider ?? "runway";

  if (resolvedProvider === "runway" && !process.env.RUNWAY_API_KEY) {
    return NextResponse.json(
      {
        error: "runway_unavailable",
        message: "RUNWAY_API_KEY non configuré côté serveur — génération vidéo désactivée.",
      },
      { status: 503 },
    );
  }
  if (resolvedProvider === "heygen" && !process.env.HEYGEN_API_KEY) {
    return NextResponse.json(
      {
        error: "heygen_unavailable",
        message: "HEYGEN_API_KEY non configuré côté serveur — génération vidéo désactivée.",
      },
      { status: 503 },
    );
  }

  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/jobs/video-gen",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const seconds = durationSeconds ?? 5;
  const estimatedCostUsd = seconds * COST_PER_SECOND_USD;
  const placeholderJobId = `pending-video-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const guard = await requireCreditsForJob({
    userId: scope.userId,
    tenantId: scope.tenantId,
    jobKind: "video-gen",
    estimatedCostUsd,
    jobId: placeholderJobId,
  });
  if (!guard.allowed) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: formatInsufficientCreditsMessage(guard, "video-gen"),
        availableUsd: guard.availableUsd,
        estimatedCostUsd: guard.estimatedCostUsd,
      },
      { status: 402 },
    );
  }

  const assetId = randomUUID();
  await storeAsset({
    id: assetId,
    threadId: threadId ?? scope.workspaceId,
    kind: "report",
    title: prompt.slice(0, 80),
    summary: prompt.slice(0, 200),
    contentRef: "",
    createdAt: Date.now(),
    provenance: {
      providerId: "system",
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      modelUsed: resolvedProvider,
      costUsd: estimatedCostUsd,
    },
  });

  const variantId = await createVariant({
    assetId,
    kind: "video",
    status: "pending",
    provider: resolvedProvider,
  });

  const payload: VideoGenInput & { variantId: string | null; variantKind: string } = {
    jobKind: "video-gen",
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    assetId,
    estimatedCostUsd,
    prompt,
    provider: resolvedProvider,
    durationSeconds: seconds,
    variantId,
    variantKind: "video",
  };

  try {
    const enqueued = await enqueueJob(payload);
    return NextResponse.json(
      {
        jobId: enqueued.jobId,
        jobKind: "video-gen",
        assetId,
        variantId,
        status: "pending",
        estimatedCostUsd,
      },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/jobs/video-gen] enqueue failed:", message);

    await settleCredits({
      userId: scope.userId,
      tenantId: scope.tenantId,
      reservedUsd: estimatedCostUsd,
      actualUsd: 0,
      jobId: placeholderJobId,
      jobKind: "video-gen",
      description: `enqueue_failed: ${message.slice(0, 200)}`,
    }).catch((settleErr) => {
      console.error("[POST /api/v2/jobs/video-gen] credit refund failed:", settleErr);
    });

    if (variantId) {
      await updateVariant(variantId, {
        status: "failed",
        error: `enqueue_failed: ${message.slice(0, 500)}`,
        metadata: { reason: "enqueue_failed" },
      }).catch(() => {});
    }

    return NextResponse.json(
      { error: "enqueue_failed", message },
      { status: 503 },
    );
  }
}

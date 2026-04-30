/**
 * POST /api/v2/jobs/image-gen
 *
 * Lance une génération d'image fal.ai (worker `image-gen`). Crée un asset
 * placeholder + variant pending immédiatement pour que l'UI puisse afficher
 * un état "en cours" sans attendre. Le client poll
 * GET /api/v2/jobs/[jobId]/status?kind=image-gen pour voir le résultat.
 *
 * Body : { prompt: string, threadId?: string, count?: number, size?: string }
 * Return : { jobId, assetId, variantId, status: "pending" }
 *
 * Sans FAL_KEY → 503 explicite (le worker fal.ai retournerait silencieusement
 * un array vide, ce qu'on évite ici en bouchant en amont).
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
import type { ImageGenInput } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  threadId: z.string().optional(),
  count: z.number().int().min(1).max(4).optional(),
  size: z
    .enum(["256x256", "512x512", "1024x1024", "1536x1024", "1024x1536"])
    .optional(),
});

const ESTIMATED_COST_USD_PER_IMAGE = 0.05;

export async function POST(req: NextRequest) {
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      {
        error: "fal_unavailable",
        message: "FAL_KEY non configuré côté serveur — génération d'image désactivée.",
      },
      { status: 503 },
    );
  }

  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/jobs/image-gen",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

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

  const { prompt, threadId, count } = parsed.data;
  const numImages = count ?? 1;
  const estimatedCostUsd = ESTIMATED_COST_USD_PER_IMAGE * numImages;
  const placeholderJobId = `pending-image-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const guard = await requireCreditsForJob({
    userId: scope.userId,
    tenantId: scope.tenantId,
    jobKind: "image-gen",
    estimatedCostUsd,
    jobId: placeholderJobId,
  });
  if (!guard.allowed) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: formatInsufficientCreditsMessage(guard, "image-gen"),
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
      modelUsed: "fal-ai/flux/schnell",
      costUsd: estimatedCostUsd,
    },
  });

  const variantId = await createVariant({
    assetId,
    kind: "image",
    status: "pending",
    provider: "fal",
  });

  const payload: ImageGenInput & { variantId: string | null; variantKind: string } = {
    jobKind: "image-gen",
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    assetId,
    estimatedCostUsd,
    prompt,
    provider: "fal",
    variantId,
    variantKind: "image",
  };

  try {
    const enqueued = await enqueueJob(payload);
    return NextResponse.json(
      {
        jobId: enqueued.jobId,
        jobKind: "image-gen",
        assetId,
        variantId,
        status: "pending",
        estimatedCostUsd,
      },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/jobs/image-gen] enqueue failed:", message);

    await settleCredits({
      userId: scope.userId,
      tenantId: scope.tenantId,
      reservedUsd: estimatedCostUsd,
      actualUsd: 0,
      jobId: placeholderJobId,
      jobKind: "image-gen",
      description: `enqueue_failed: ${message.slice(0, 200)}`,
    }).catch((settleErr) => {
      console.error("[POST /api/v2/jobs/image-gen] credit refund failed:", settleErr);
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

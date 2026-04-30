/**
 * POST /api/v2/jobs/code-exec
 *
 * Lance une exécution sandbox E2B (worker `code-exec`). Crée un asset
 * placeholder + variant code pending immédiatement. Le client poll
 * GET /api/v2/jobs/[jobId]/status?kind=code-exec.
 *
 * Body : { code: string, runtime?: "python"|"node", timeoutMs?, threadId? }
 * Return : { jobId, assetId, variantId, status: "pending" }
 *
 * Sans E2B_API_KEY → 503.
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
import type { CodeExecInput } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1).max(50_000),
  runtime: z.enum(["python", "node"]).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  threadId: z.string().optional(),
});

const ESTIMATED_COST_USD = 0.002;

export async function POST(req: NextRequest) {
  if (!process.env.E2B_API_KEY) {
    return NextResponse.json(
      {
        error: "e2b_unavailable",
        message: "E2B_API_KEY non configuré côté serveur — exécution code désactivée.",
      },
      { status: 503 },
    );
  }

  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/jobs/code-exec",
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

  const { code, runtime: codeRuntime, timeoutMs, threadId } = parsed.data;
  const placeholderJobId = `pending-exec-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const guard = await requireCreditsForJob({
    userId: scope.userId,
    tenantId: scope.tenantId,
    jobKind: "code-exec",
    estimatedCostUsd: ESTIMATED_COST_USD,
    jobId: placeholderJobId,
  });
  if (!guard.allowed) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: formatInsufficientCreditsMessage(guard, "code-exec"),
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
    kind: "artifact",
    title: `Code ${codeRuntime ?? "python"} — ${code.slice(0, 40)}`,
    summary: code.slice(0, 200),
    contentRef: code.slice(0, 50_000),
    createdAt: Date.now(),
    provenance: {
      providerId: "system",
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      modelUsed: `e2b-${codeRuntime ?? "python"}`,
      costUsd: ESTIMATED_COST_USD,
    },
  });

  const variantId = await createVariant({
    assetId,
    kind: "code",
    status: "pending",
    provider: "e2b",
  });

  const payload: CodeExecInput & { variantId: string | null } = {
    jobKind: "code-exec",
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    assetId,
    estimatedCostUsd: ESTIMATED_COST_USD,
    code,
    runtime: codeRuntime ?? "python",
    timeoutMs,
    variantId,
  };

  try {
    const enqueued = await enqueueJob(payload);
    return NextResponse.json(
      {
        jobId: enqueued.jobId,
        jobKind: "code-exec",
        assetId,
        variantId,
        status: "pending",
        estimatedCostUsd: ESTIMATED_COST_USD,
      },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/jobs/code-exec] enqueue failed:", message);

    await settleCredits({
      userId: scope.userId,
      tenantId: scope.tenantId,
      reservedUsd: ESTIMATED_COST_USD,
      actualUsd: 0,
      jobId: placeholderJobId,
      jobKind: "code-exec",
      description: `enqueue_failed: ${message.slice(0, 200)}`,
    }).catch((settleErr) => {
      console.error("[POST /api/v2/jobs/code-exec] credit refund failed:", settleErr);
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

/**
 * POST /api/v2/inbox/refresh
 *
 * Enqueue un job inbox-fetch pour le user authentifié.
 *
 * Throttle 5min côté server (canEnqueueInboxFetch). Sans REDIS_URL,
 * on retombe en exécution inline (pas de queue).
 *
 * Return : { jobId, status: "pending" | "throttled" | "inline-ok" }
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { enqueueJob } from "@/lib/jobs/queue";
import {
  canEnqueueInboxFetch,
  markInboxFetchEnqueued,
} from "@/lib/jobs/scheduled/inbox-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const { scope, error } = await requireScope({ context: "POST /api/v2/inbox/refresh" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  if (!canEnqueueInboxFetch(scope.userId)) {
    return NextResponse.json(
      {
        status: "throttled",
        message: "Rafraîchissement déjà demandé il y a moins de 5 minutes.",
      },
      { status: 429 },
    );
  }

  try {
    const { jobId } = await enqueueJob({
      jobKind: "inbox-fetch",
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      estimatedCostUsd: 0.002,
      trigger: "manual",
    });
    markInboxFetchEnqueued(scope.userId);
    return NextResponse.json({ jobId, status: "pending" }, { status: 202 });
  } catch (err) {
    // Fallback inline (REDIS_URL absent en dev) : on lance la génération
    // directement et on persiste l'asset, sans queue.
    const message = err instanceof Error ? err.message : String(err);
    if (/REDIS_URL/i.test(message) || /Queue.*unavailable/i.test(message)) {
      try {
        const { generateInboxBrief } = await import("@/lib/inbox/inbox-brief");
        const { storeAsset } = await import("@/lib/assets/types");
        const { randomUUID } = await import("node:crypto");

        const brief = await generateInboxBrief(scope.userId, scope.tenantId);
        const assetId = randomUUID();
        await storeAsset({
          id: assetId,
          threadId: `inbox:${scope.userId}`,
          kind: "inbox_brief",
          title: `Inbox · ${new Date(brief.generatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
          summary: brief.empty
            ? "Aucun signal entrant"
            : `${brief.items.length} signaux`,
          contentRef: JSON.stringify(brief),
          createdAt: brief.generatedAt,
          provenance: {
            providerId: "system",
            userId: scope.userId,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
          },
        });
        markInboxFetchEnqueued(scope.userId);
        return NextResponse.json(
          { status: "inline-ok", assetId, itemCount: brief.items.length },
          { status: 200 },
        );
      } catch (inlineErr) {
        console.error("[POST /api/v2/inbox/refresh] inline fallback failed:", inlineErr);
        return NextResponse.json(
          { error: "inline_failed", message: inlineErr instanceof Error ? inlineErr.message : String(inlineErr) },
          { status: 503 },
        );
      }
    }
    console.error("[POST /api/v2/inbox/refresh] enqueue failed:", message);
    return NextResponse.json({ error: "enqueue_failed", message }, { status: 503 });
  }
}

/**
 * POST /api/v2/daily-brief/generate
 *
 * Enqueue un job `daily-brief` pour le user authentifié. Si REDIS_URL absent,
 * fallback inline (assemble + render + persist tout de suite, retourne
 * l'assetId). Pattern aligné avec /api/v2/inbox/refresh.
 *
 * Body optionnel : { targetDate?: "YYYY-MM-DD" } — défaut aujourd'hui.
 *
 * Throttling : 1 job par user par date — si un brief existe déjà pour
 * targetDate, on retourne 200 + l'asset existant plutôt que de relancer.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { enqueueJob } from "@/lib/jobs/queue";
import { loadDailyBriefForDate } from "@/lib/daily-brief/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/daily-brief/generate",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let body: { targetDate?: unknown } = {};
  try {
    body = (await req.json()) as { targetDate?: unknown };
  } catch {
    // Body optionnel — pas une erreur s'il est vide.
  }

  const targetDate =
    typeof body.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)
      ? body.targetDate
      : todayIso();

  // Idempotence : si un brief existe déjà pour cette date, on le retourne
  // plutôt que de re-générer (évite de bombarder Sonnet + R2).
  const existing = await loadDailyBriefForDate({
    userId: scope.userId,
    targetDate,
  });
  if (existing) {
    return NextResponse.json(
      {
        status: "exists",
        assetId: existing.assetId,
        targetDate,
        pdfUrl: existing.pdfUrl,
      },
      { status: 200 },
    );
  }

  try {
    const { jobId } = await enqueueJob({
      jobKind: "daily-brief",
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      estimatedCostUsd: 0.05,
      targetDate,
      trigger: "manual",
    });
    return NextResponse.json({ jobId, status: "pending", targetDate }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Fallback inline (REDIS_URL absent en dev) — on exécute le worker
    // dans le request handler. Vercel Pro = 60s timeout, mais on a la
    // marge (Sonnet ~15s + render ~5s + upload ~10s ≈ 30s).
    if (/REDIS_URL/i.test(message) || /Queue.*unavailable/i.test(message)) {
      try {
        const { assembleDailyBriefData } = await import("@/lib/daily-brief/assembler");
        const { generateDailyBriefNarration } = await import("@/lib/daily-brief/generate");
        const { renderDailyBriefPdf } = await import("@/lib/daily-brief/pdf");
        const { persistExport, getExportSignedUrl } = await import(
          "@/lib/reports/export/store"
        );
        const { storeAsset } = await import("@/lib/assets/types");
        const { randomUUID } = await import("node:crypto");

        const data = await assembleDailyBriefData({
          userId: scope.userId,
          tenantId: scope.tenantId,
          targetDate,
        });
        const narration = await generateDailyBriefNarration(data);
        const pdf = await renderDailyBriefPdf({
          data,
          narration,
          date: new Date(targetDate),
        });

        const assetId = randomUUID();
        const persisted = await persistExport({
          result: pdf,
          format: "pdf",
          assetId,
          tenantId: scope.tenantId,
          createdBy: scope.userId,
        });

        let signedUrl: string | null = null;
        try {
          signedUrl = await getExportSignedUrl(persisted.storageKey, {
            expiresInSeconds: 24 * 3600,
            downloadName: pdf.fileName,
          });
        } catch {
          /* ignore */
        }

        const totalItems =
          data.emails.length +
          data.slack.length +
          data.calendar.length +
          data.github.length +
          data.linear.length;

        const titleDate = new Date(targetDate).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        await storeAsset({
          id: assetId,
          threadId: `daily-brief:${scope.userId}`,
          kind: "daily_brief",
          title: `Daily Brief · ${titleDate}`,
          summary:
            totalItems > 0
              ? `${totalItems} signaux · ${data.sources.filter((s) => !s.endsWith(":error") && !s.endsWith(":empty")).join(", ")}`
              : "Aucune source connectée",
          contentRef: JSON.stringify({
            narration,
            meta: {
              totalItems,
              sources: data.sources,
              targetDate,
              pdfUrl: signedUrl,
              storageKey: persisted.storageKey,
              pdfSizeBytes: pdf.size,
            },
            counts: {
              emails: data.emails.length,
              slack: data.slack.length,
              calendar: data.calendar.length,
              github: data.github.length,
              linear: data.linear.length,
            },
          }),
          createdAt: data.generatedAt,
          provenance: {
            providerId: "system",
            userId: scope.userId,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
          },
        });

        return NextResponse.json(
          {
            status: "inline-ok",
            assetId,
            targetDate,
            pdfUrl: signedUrl,
            totalItems,
            sources: data.sources,
          },
          { status: 200 },
        );
      } catch (inlineErr) {
        console.error("[POST /api/v2/daily-brief/generate] inline failed:", inlineErr);
        return NextResponse.json(
          {
            error: "inline_failed",
            message: inlineErr instanceof Error ? inlineErr.message : String(inlineErr),
          },
          { status: 503 },
        );
      }
    }

    console.error("[POST /api/v2/daily-brief/generate] enqueue failed:", message);
    return NextResponse.json({ error: "enqueue_failed", message }, { status: 503 });
  }
}

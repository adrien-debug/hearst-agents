/**
 * POST /api/v2/reports/[specId]/run
 *
 * Build le ReportSpec catalogué, exécute le pipeline déterministe
 * (fetch → transform → render → narrate) et retourne le payload + narration.
 *
 * Body optionnel :
 *   { threadId?: string, customerEmail?: string, noCache?: boolean }
 *
 * Si threadId est fourni, l'asset est persisté (kind="report"). Sinon le
 * payload est juste retourné dans la réponse.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getCatalogEntry } from "@/lib/reports/catalog";
import { runReport } from "@/lib/reports/engine/run-report";
import { createSourceLoader } from "@/lib/reports/sources";
import { storeAsset, type Asset } from "@/lib/assets/types";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

interface RunBody {
  threadId?: string;
  customerEmail?: string;
  noCache?: boolean;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ specId: string }> },
) {
  const { specId } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `POST /api/v2/reports/${specId}/run`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const entry = getCatalogEntry(specId);
  if (!entry) {
    return NextResponse.json({ error: "spec_not_found" }, { status: 404 });
  }

  let body: RunBody = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  // Build le Spec parametré
  const spec = entry.build(
    {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    },
    body.customerEmail ? { customerEmail: body.customerEmail } : undefined,
  );

  const loader = createSourceLoader({ spec, noCache: body.noCache });

  let result;
  try {
    result = await runReport(spec, {
      sourceLoader: loader,
      noCache: body.noCache,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ReportsAPI] runReport failed (${specId}):`, msg);
    return NextResponse.json({ error: "run_failed", detail: msg }, { status: 500 });
  }

  // Persiste l'asset si on a un thread cible
  if (body.threadId) {
    const asset: Asset = {
      id: randomUUID(),
      threadId: body.threadId,
      kind: "report",
      title: spec.meta.title,
      summary: spec.meta.summary,
      provenance: {
        providerId: "reports",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ specId: spec.id, specVersion: spec.version, runArtifact: true } as any),
      },
      createdAt: Date.now(),
      contentRef: JSON.stringify({
        ...result.payload,
        narration: result.narration,
      }),
    };
    storeAsset(asset);
  }

  return NextResponse.json({
    payload: result.payload,
    narration: result.narration,
    cacheHit: result.cacheHit,
    cost: result.cost,
    durationMs: result.durationMs,
  });
}

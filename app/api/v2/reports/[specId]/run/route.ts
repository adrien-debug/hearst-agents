/**
 * POST /api/v2/reports/[specId]/run
 *
 * Build le ReportSpec catalogué OU custom (template) puis exécute le pipeline
 * déterministe (fetch → transform → render → narrate) et retourne le payload
 * + narration.
 *
 * Resolution :
 *   1. Tente de résoudre `specId` dans le CATALOG (rapports prédéfinis).
 *   2. Sinon, tente `loadTemplate({ templateId: specId, tenantId })`.
 *   3. 404 si aucun match.
 *
 * Body optionnel :
 *   { threadId?: string, customerEmail?: string, noCache?: boolean,
 *     sample?: boolean }
 *
 * `sample === true` désactive le cache et limite la sortie à un preview
 * (utilisé par le Studio pour debounced preview).
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
import { loadTemplate } from "@/lib/reports/templates/store";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RunBody {
  threadId?: string;
  customerEmail?: string;
  noCache?: boolean;
  sample?: boolean;
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

  let body: RunBody = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const callerScope = {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    userId: scope.userId,
  };

  // 1. Builtin catalog
  let spec: ReportSpec | null = null;
  const entry = getCatalogEntry(specId);
  if (entry) {
    spec = entry.build(
      callerScope,
      body.customerEmail ? { customerEmail: body.customerEmail } : undefined,
    );
  } else {
    // 2. Custom template (UUID)
    const customSpec = await loadTemplate({
      templateId: specId,
      tenantId: scope.tenantId,
    });
    if (customSpec) {
      // On force le scope du caller (le scope stocké peut être l'ancien).
      spec = { ...customSpec, scope: callerScope };
    }
  }

  if (!spec) {
    return NextResponse.json({ error: "spec_not_found" }, { status: 404 });
  }

  const noCache = body.noCache === true || body.sample === true;
  const loader = createSourceLoader({ spec, noCache });

  let result;
  try {
    result = await runReport(spec, {
      sourceLoader: loader,
      noCache,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ReportsAPI] runReport failed (${specId}):`, msg);
    return NextResponse.json({ error: "run_failed", detail: msg }, { status: 500 });
  }

  // En mode sample on ne persiste rien (preview Studio).
  let assetId: string | null = null;
  if (body.threadId && !body.sample) {
    assetId = randomUUID();
    const asset: Asset = {
      id: assetId,
      threadId: body.threadId,
      kind: "report",
      title: spec.meta.title,
      summary: spec.meta.summary,
      provenance: {
        providerId: "system",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        specId: spec.id,
        specVersion: spec.version,
        runArtifact: true,
        reportMeta: {
          signals: result.signals,
          severity: result.severity,
        },
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
    assetId,
    title: spec.meta.title,
    payload: result.payload,
    narration: result.narration,
    signals: result.signals,
    severity: result.severity,
    cacheHit: result.cacheHit,
    cost: result.cost,
    durationMs: result.durationMs,
    sample: body.sample === true,
  });
}

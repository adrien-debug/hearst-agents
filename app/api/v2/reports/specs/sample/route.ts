/**
 * POST /api/v2/reports/specs/sample
 *
 * Sample run inline — exécute un ReportSpec sans le persister. Utilisé par
 * /reports/studio pour permettre la preview avant la première sauvegarde
 * (sinon Adrien doit Save → Sample → Edit → Save → Sample, etc., très
 * frustrant dans la phase d'exploration).
 *
 * Body :
 *   { spec: ReportSpec }    // spec inline, validé via Zod
 *
 * Réponse :
 *   { payload, narration, signals, severity, cost, durationMs, sample: true }
 *
 * Aucun asset n'est créé, le cache render est désactivé (noCache=true) pour
 * que chaque preview reflète l'état courant du spec en construction.
 *
 * Sécurité : on force le scope du caller dans le spec exécuté (le builder
 * Studio peut envoyer un scope démo) — strictement comme POST /specs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import { runReport } from "@/lib/reports/engine/run-report";
import { createSourceLoader } from "@/lib/reports/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  spec: reportSpecSchema,
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/reports/specs/sample",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Force le scope caller — le spec sample peut venir d'un brouillon Studio
  // dont le scope n'est pas encore canonique.
  const sealedSpec = {
    ...parsed.data.spec,
    scope: {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    },
  };

  const loader = createSourceLoader({ spec: sealedSpec, noCache: true });

  try {
    const result = await runReport(sealedSpec, {
      sourceLoader: loader,
      noCache: true,
    });
    return NextResponse.json({
      payload: result.payload,
      narration: result.narration,
      signals: result.signals,
      severity: result.severity,
      cost: result.cost,
      durationMs: result.durationMs,
      sample: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ReportsAPI] sample run failed:", msg);
    return NextResponse.json(
      { error: "run_failed", detail: msg },
      { status: 500 },
    );
  }
}

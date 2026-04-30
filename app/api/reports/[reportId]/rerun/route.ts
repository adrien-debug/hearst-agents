/**
 * POST /api/reports/[reportId]/rerun — stub.
 *
 * Re-déclenche un report ad-hoc depuis l'asset_id. La réimplémentation
 * réelle doit ré-exécuter le pipeline du spec (sources + transforms +
 * renderBlocks) et produire une nouvelle version. Pour l'instant on se
 * contente de valider l'auth + la propriété de l'asset, puis on
 * répond `not_implemented` pour que l'UI affiche un toast clair.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ reportId: z.string().min(1) });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_report_id" }, { status: 400 });
  }
  const { reportId } = parsed.data;

  const { scope, error } = await requireScope({
    context: `POST /api/reports/${reportId}/rerun`,
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  // TODO : recharger le spec d'origine et relancer runReport(spec, scope).
  // Pour l'instant, l'endpoint est un stub destiné à confirmer que la
  // chaîne UI → API → backend est branchée. Le 501 est un signal clair
  // côté client (le toast affiche "Re-run non disponible pour cet asset").
  return NextResponse.json(
    {
      ok: false,
      reportId,
      error: "not_implemented",
      message: "Re-run on-demand pas encore implémenté pour cet asset.",
    },
    { status: 501 },
  );
}

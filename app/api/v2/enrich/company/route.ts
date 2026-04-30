/**
 * POST /api/v2/enrich/company — PDL company enrichment.
 *
 * Body : { domain: string }
 * Retour : PdlCompany | { error }
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { enrichCompany, PdlUnavailableError } from "@/lib/capabilities/providers/pdl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/enrich/company" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let body: { domain?: string };
  try {
    body = (await req.json()) as { domain?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.domain || typeof body.domain !== "string") {
    return NextResponse.json({ error: "domain_required" }, { status: 400 });
  }

  try {
    const company = await enrichCompany({ domain: body.domain });
    return NextResponse.json({ company });
  } catch (err) {
    if (err instanceof PdlUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/enrich/company] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

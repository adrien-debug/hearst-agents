/**
 * POST /api/v2/enrich/contact — Apollo person enrichment.
 *
 * Body : { email: string }
 * Retour : ApolloPerson | { error }
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { enrichPerson, ApolloUnavailableError } from "@/lib/capabilities/providers/apollo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/enrich/contact" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  try {
    const person = await enrichPerson({ email: body.email });
    return NextResponse.json({ person });
  } catch (err) {
    if (err instanceof ApolloUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/enrich/contact] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

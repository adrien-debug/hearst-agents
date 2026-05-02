/**
 * POST /api/onboarding/set-industry
 *
 * Body : { industry: "general" | "hospitality" | "saas" | "ecommerce" | "finance" | "healthcare" }
 *
 * Persist le vertical du tenant dans tenant_settings (migration 0053).
 * Invalide le cache 5min de getTenantIndustry pour reflet immédiat.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { setTenantIndustry } from "@/lib/verticals/hospitality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  industry: z.enum(["general", "hospitality", "saas", "ecommerce", "finance", "healthcare"]),
});

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/onboarding/set-industry",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
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
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setTenantIndustry(scope.tenantId, parsed.data.industry);
    return NextResponse.json({ ok: true, industry: parsed.data.industry });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[onboarding/set-industry] failed:", message);
    return NextResponse.json({ error: "set_industry_failed", message }, { status: 500 });
  }
}

/**
 * POST /api/reports/share
 *
 * Crée un share link signé pour un asset (kind=report) appartenant au tenant
 * de l'utilisateur authentifié.
 *
 * Body :
 *   { assetId: string, ttlHours?: number }
 *
 * Réponse 200 :
 *   { shareUrl: string, expiresAt: string, shareId: string }
 *
 * Erreurs :
 *   401 not_authenticated
 *   400 invalid_input
 *   403 forbidden          (asset pas dans le tenant du caller)
 *   404 asset_not_found
 *   429 rate_limited
 *   503 signing_unavailable (REPORT_SHARING_SECRET absent)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import {
  signToken,
  buildShareUrl,
  checkShareRateLimit,
  TTL_DEFAULT_HOURS,
  TTL_MIN_HOURS,
  TTL_MAX_HOURS,
} from "@/lib/reports/sharing/signed-url";
import { createShareRow } from "@/lib/reports/sharing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assetId: z.string().min(1).max(200),
  ttlHours: z
    .number()
    .int()
    .min(TTL_MIN_HOURS)
    .max(TTL_MAX_HOURS)
    .default(TTL_DEFAULT_HOURS),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "reports/share" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Rate limit : 30/h par user
  const rate = checkShareRateLimit(scope.userId);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
      { status: 429 },
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
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Vérifie que l'asset existe et appartient au caller (tenant + user).
  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  const { data: asset, error: fetchErr } = await sb
    .from("assets")
    .select("id, kind, provenance")
    .eq("id", parsed.data.assetId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }
  const provenance = (asset.provenance ?? {}) as Record<string, unknown>;
  if (
    provenance.userId !== undefined &&
    provenance.userId !== scope.userId
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (asset.kind !== "report") {
    return NextResponse.json({ error: "asset_not_report" }, { status: 400 });
  }

  const shareId = crypto.randomUUID();
  const signed = signToken({
    shareId,
    assetId: asset.id,
    ttlHours: parsed.data.ttlHours,
  });
  if (!signed) {
    return NextResponse.json(
      { error: "signing_unavailable" },
      { status: 503 },
    );
  }

  const tenantId =
    (provenance.tenantId as string | undefined) ?? scope.tenantId;

  const row = await createShareRow({
    shareId,
    assetId: asset.id,
    tenantId,
    tokenHash: signed.tokenHash,
    expiresAt: signed.expiresAt,
    createdBy: scope.userId,
  });
  if (!row) {
    return NextResponse.json(
      { error: "persistence_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    shareUrl: buildShareUrl(signed.token),
    expiresAt: signed.expiresAt,
    shareId,
  });
}

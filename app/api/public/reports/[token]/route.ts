/**
 * GET /api/public/reports/[token]
 *
 * Endpoint public — pas d'auth NextAuth. Vérifie le token signé HMAC,
 * vérifie l'expiration + l'existence de l'asset, incrémente view_count
 * (best-effort) et retourne le payload consommable côté UI publique.
 *
 * Réponse 200 :
 *   {
 *     asset: { id, title, kind, summary, createdAt },
 *     payload: RenderPayload | null,    // depuis assets.content_ref si JSON
 *     narration: string | null,
 *     meta: { tenantBranding?: ... }    // futur — pour l'instant noindex
 *   }
 *
 * Erreurs :
 *   400 malformed_token
 *   403 expired | bad_signature | revoked
 *   404 not_found
 *   503 no_secret (server misconfig)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  hashToken,
} from "@/lib/reports/sharing/signed-url";
import {
  findShareByTokenHash,
  incrementShareViewCount,
} from "@/lib/reports/sharing/store";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string }>;
}

function noIndexHeaders(): HeadersInit {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store, max-age=0",
  };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { token } = await ctx.params;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "malformed_token" },
      { status: 400, headers: noIndexHeaders() },
    );
  }

  const verify = verifyToken(token);
  if (!verify.ok) {
    if (verify.reason === "no_secret") {
      return NextResponse.json(
        { error: "server_misconfigured" },
        { status: 503, headers: noIndexHeaders() },
      );
    }
    if (verify.reason === "expired") {
      return NextResponse.json(
        { error: "expired" },
        { status: 403, headers: noIndexHeaders() },
      );
    }
    return NextResponse.json(
      { error: verify.reason },
      { status: 403, headers: noIndexHeaders() },
    );
  }

  const tokenHash = hashToken(token);
  const share = await findShareByTokenHash(tokenHash);
  if (!share) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: noIndexHeaders() },
    );
  }
  if (share.revoked_at) {
    return NextResponse.json(
      { error: "revoked" },
      { status: 403, headers: noIndexHeaders() },
    );
  }

  // Charge l'asset + son contenu (RenderPayload sérialisé dans content_ref).
  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "storage_unavailable" },
      { status: 503, headers: noIndexHeaders() },
    );
  }
  const { data: asset, error } = await sb
    .from("assets")
    .select("id, kind, title, summary, content_ref, created_at, provenance")
    .eq("id", share.asset_id)
    .maybeSingle();
  if (error || !asset) {
    return NextResponse.json(
      { error: "asset_not_found" },
      { status: 404, headers: noIndexHeaders() },
    );
  }

  // content_ref peut être inline JSON (notre cas) ou une URL — on essaie de parser.
  let payload: unknown = null;
  let narration: string | null = null;
  if (typeof asset.content_ref === "string" && asset.content_ref.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(asset.content_ref) as Record<string, unknown>;
      if (parsed && parsed.__reportPayload === true) {
        payload = parsed;
      } else if (parsed && typeof parsed === "object") {
        payload = (parsed.payload as unknown) ?? null;
        narration = (parsed.narration as string | null) ?? null;
      }
    } catch {
      // ignore — payload reste null
    }
  }

  // best-effort view_count increment
  void incrementShareViewCount(share.id);

  return NextResponse.json(
    {
      asset: {
        id: asset.id,
        title: asset.title,
        kind: asset.kind,
        summary: asset.summary,
        createdAt: asset.created_at,
      },
      payload,
      narration,
      expiresAt: share.expires_at,
      viewCount: share.view_count + 1,
    },
    { status: 200, headers: noIndexHeaders() },
  );
}

/**
 * GET  /api/admin/vitals — snapshot p75 par métrique (LCP, CLS, INP, TTFB, FCP)
 * POST /api/admin/vitals — enregistre une mesure Web Vitals (beacon client)
 *
 * GET : protégé par requireAdmin (même garde que /api/admin/llm-metrics).
 * POST : pas d'auth requise (sendBeacon ne peut pas envoyer de cookie facilement).
 *        Vérification d'origine via Referer/Origin pour limiter l'abus.
 *
 * Stockage : in-memory rolling window 100 mesures (lib/monitoring/web-vitals-store.ts).
 * Pas de persistence DB en V1.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, isError } from "../_helpers";
import { recordVital, getVitalsSnapshot } from "@/lib/monitoring/web-vitals-store";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Schéma de validation du payload Web Vitals
// ---------------------------------------------------------------------------

const VitalPayloadSchema = z.object({
  name: z.enum(["LCP", "CLS", "INP", "TTFB", "FCP"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  delta: z.number().finite(),
  id: z.string().min(1),
  navigationType: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET — snapshot (admin uniquement)
// ---------------------------------------------------------------------------

export async function GET() {
  const guard = await requireAdmin("GET /api/admin/vitals", {
    resource: "settings",
    action: "read",
  });
  if (isError(guard)) return guard;

  try {
    const snapshot = getVitalsSnapshot();
    return NextResponse.json(snapshot, { status: 200 });
  } catch (e) {
    console.error("[Admin API] GET /vitals error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — collecte beacon (pas d'auth, vérif origin)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Vérification basique de l'origine : accepte seulement les requêtes
  // provenant du même host (Referer ou Origin présents et cohérents).
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (host && origin && !origin.includes(host)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }
  if (host && referer && !referer.includes(host)) {
    return NextResponse.json({ error: "forbidden_referer" }, { status: 403 });
  }

  let body: unknown;
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = VitalPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    recordVital(parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[Admin API] POST /vitals error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

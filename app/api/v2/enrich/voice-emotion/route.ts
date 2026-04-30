/**
 * POST /api/v2/enrich/voice-emotion — Hume EVI voice emotion analysis.
 *
 * Body : { audioUrl: string }
 * Retour : HumeEmotionResult | { error }
 */

import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  analyzeVoiceEmotion,
  HumeUnavailableError,
} from "@/lib/capabilities/providers/hume";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/enrich/voice-emotion" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let body: { audioUrl?: string };
  try {
    body = (await req.json()) as { audioUrl?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.audioUrl || typeof body.audioUrl !== "string") {
    return NextResponse.json({ error: "audioUrl_required" }, { status: 400 });
  }

  try {
    const result = await analyzeVoiceEmotion(body.audioUrl);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HumeUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/enrich/voice-emotion] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

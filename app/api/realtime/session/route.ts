/**
 * POST /api/realtime/session — Mint un éphémère OpenAI Realtime.
 *
 * Signature 6 — Pulse Vocal Ambient. Le client browser appelle cette
 * route, récupère ephemeralKey + sessionId, puis ouvre un PeerConnection
 * direct vers api.openai.com (l'API key complète ne quitte jamais le
 * serveur).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { mintRealtimeSession } from "@/lib/capabilities/providers/openai-realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/realtime/session",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  try {
    const session = await mintRealtimeSession();
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[realtime/session] mint failed:", message);
    return NextResponse.json(
      { error: "realtime_session_failed", message },
      { status: 500 },
    );
  }
}

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
import { voiceToolDefs } from "@/lib/voice/tools";
import { getVoiceComposioTools } from "@/lib/voice/composio-bridge";

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
    // Mint per-user : on merge les 3 hearst-actions statiques avec les
    // tools Composio des apps que CE user a connectées (curés à 20 max
    // pour ne pas saturer le contexte voix). Si Composio n'est pas
    // configuré ou que l'user n'a rien connecté, on retombe sur les
    // 3 hearst-actions seules.
    const composioTools = await getVoiceComposioTools(scope.userId);
    const tools = [...voiceToolDefs, ...composioTools];
    const session = await mintRealtimeSession({ tools });
    return NextResponse.json({ ...session, toolCount: tools.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[realtime/session] mint failed:", message);
    return NextResponse.json(
      { error: "realtime_session_failed", message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/realtime/session — Mint un éphémère OpenAI Realtime.
 *
 * Signature 6 — Pulse Vocal Ambient. Le client browser appelle cette
 * route, récupère ephemeralKey + sessionId + voice, puis ouvre un
 * PeerConnection direct vers api.openai.com (l'API key complète ne
 * quitte jamais le serveur).
 *
 * Le client peut passer `tone` (ou `personaId` + `tone`) en body pour
 * que la session soit mintée avec la voix Realtime adaptée à la persona
 * active (ash/sage/alloy/coral/ballad/verse). Sans tone → "alloy" default.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { mintRealtimeSession } from "@/lib/capabilities/providers/openai-realtime";
import { voiceToolDefs } from "@/lib/voice/tools";
import { getVoiceComposioTools } from "@/lib/voice/composio-bridge";
import { resolveRealtimeVoice } from "@/lib/voice/voice-mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    tone: z
      .enum([
        "formal",
        "direct",
        "analytical",
        "casual",
        "warm-professional",
        "creative",
        "default",
      ])
      .optional(),
    personaId: z.string().optional(),
    voice: z
      .enum(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"])
      .optional(),
  })
  .optional();

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/realtime/session",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  // Body optionnel — anciens clients sans body fonctionnent (default alloy).
  let parsedTone: string | undefined;
  let parsedVoice:
    | "alloy"
    | "ash"
    | "ballad"
    | "coral"
    | "echo"
    | "sage"
    | "shimmer"
    | "verse"
    | undefined;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success && parsed.data) {
      parsedTone = parsed.data.tone;
      parsedVoice = parsed.data.voice;
    }
  } catch {
    // body absent / invalide → default alloy
  }

  try {
    const composioTools = await getVoiceComposioTools(scope.userId);
    const tools = [...voiceToolDefs, ...composioTools];
    // Extrait les slugs d'apps depuis les tools Composio (préfixe avant "_") :
    // SLACK_SEND_MESSAGE → slack, GMAIL_FETCH_EMAILS → gmail. Dédupliqué et trié
    // pour produire une liste stable injectée dans les instructions voix.
    const connectedApps = Array.from(
      new Set(
        composioTools
          .map((t) => t.name.split("_")[0]?.toLowerCase())
          .filter((s): s is string => Boolean(s)),
      ),
    ).sort();
    const session = await mintRealtimeSession({
      tools,
      voice: parsedVoice,
      personaTone: parsedTone,
      connectedApps,
    });
    return NextResponse.json({
      ...session,
      toolCount: tools.length,
      resolvedVoice: parsedVoice ?? resolveRealtimeVoice(parsedTone),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[realtime/session] mint failed:", message);
    return NextResponse.json(
      { error: "realtime_session_failed", message },
      { status: 500 },
    );
  }
}

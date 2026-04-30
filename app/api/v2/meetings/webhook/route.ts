/**
 * POST /api/v2/meetings/webhook — receveur callback Recall.ai.
 *
 * Recall pousse des status updates (joining, in_call, recording, done, fatal,
 * call_ended) en cours de session. On vérifie la signature HMAC quand
 * `RECALL_WEBHOOK_SECRET` est set, sinon on accepte avec un warn.
 *
 * Le payload est loggé + cache mémoire est mis à jour pour que MeetingStage
 * puisse short-circuit son prochain polling (Phase 2 ajoutera un push SSE
 * dédié — pour l'instant le polling toutes les 5s côté UI couvre le besoin).
 *
 * Pas d'auth user-side : Recall n'envoie pas de JWT. Toute la sécu repose
 * sur la signature webhook + l'unguessable bot ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/capabilities/providers/recall-ai";
import { recordWebhookEvent } from "@/lib/meetings/webhook-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RecallWebhookPayload {
  event?: string;
  data?: {
    bot_id?: string;
    status?: { code?: string; message?: string };
    code?: string;
    transcript?: string;
    recording?: { id?: string; url?: string };
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-recall-signature") ?? req.headers.get("recall-signature");
  const timestamp =
    req.headers.get("x-recall-timestamp") ?? req.headers.get("recall-timestamp");

  const verdict = verifyWebhookSignature({ rawBody, signature, timestamp });

  // Cas 1 — secret manquant : refus strict en prod, accept silencieux en dev
  if (verdict.reason === "no_secret") {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[meetings/webhook] RECALL_WEBHOOK_SECRET absent en production — webhook désactivé",
      );
      return NextResponse.json(
        { error: "webhook_secret_not_configured" },
        { status: 503 },
      );
    }
    console.warn(
      "[meetings/webhook] RECALL_WEBHOOK_SECRET absent (dev) — payload accepté sans vérif",
    );
    // tombe through pour traiter le payload
  } else if (!verdict.valid) {
    // Cas 2 — secret présent mais signature invalide : 403 strict
    console.warn(`[meetings/webhook] signature invalide (${verdict.reason})`);
    return NextResponse.json(
      { error: "invalid_signature", reason: verdict.reason },
      { status: 403 },
    );
  }

  let payload: RecallWebhookPayload = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as RecallWebhookPayload) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const botId = payload.data?.bot_id;
  const event = payload.event ?? "unknown";
  const code = payload.data?.status?.code ?? payload.data?.code;
  const recordingUrl = payload.data?.recording?.url;

  if (botId) {
    recordWebhookEvent(botId, {
      event,
      statusCode: code,
      recordingUrl,
      receivedAt: Date.now(),
    });
  }

  return NextResponse.json({ ok: true, received: event, botId: botId ?? null });
}

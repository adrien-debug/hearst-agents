/**
 * POST /api/webhooks/[webhookId]/test
 *
 * Envoie un payload test (event "test.ping") vers l'URL du webhook.
 * Utile pour vérifier la configuration avant activation.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/platform/auth/options";
import { listWebhooks } from "@/lib/webhooks/store";
import { dispatchWebhookEventAsync } from "@/lib/webhooks/dispatcher";

function getTenantId(session: unknown): string | null {
  const s = session as { user?: { tenantId?: string } } | null;
  return s?.user?.tenantId ?? null;
}

type RouteContext = { params: Promise<{ webhookId: string }> };

export async function POST(
  _req: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { webhookId } = await context.params;
  const session = await getServerSession(authOptions);
  const tenantId = getTenantId(session);

  if (!tenantId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const webhooks = await listWebhooks({ tenantId });
    const webhook = webhooks.find((w) => w.id === webhookId);

    if (!webhook) {
      return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    }

    if (!webhook.active) {
      return NextResponse.json({ error: "Webhook inactif" }, { status: 400 });
    }

    const result = await dispatchWebhookEventAsync(
      "test.ping",
      tenantId,
      { message: "Test ping depuis Hearst OS", webhookId },
      undefined,
      [webhook],
    );

    const delivered = result.results[0]?.ok ?? false;

    return NextResponse.json({
      success: delivered,
      webhookId,
      dispatched: result.dispatched,
    });
  } catch (err) {
    console.error(`[API /api/webhooks/${webhookId}/test POST]`, err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

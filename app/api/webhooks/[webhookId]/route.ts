/**
 * GET    /api/webhooks/[webhookId]  — détail d'un webhook
 * PUT    /api/webhooks/[webhookId]  — mise à jour partielle
 * DELETE /api/webhooks/[webhookId]  — suppression
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/platform/auth/options";
import {
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  updateWebhookSchema,
} from "@/lib/webhooks/store";

function getTenantId(session: unknown): string | null {
  const s = session as { user?: { tenantId?: string } } | null;
  return s?.user?.tenantId ?? null;
}

type RouteContext = { params: Promise<{ webhookId: string }> };

export async function GET(
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

    return NextResponse.json({ webhook });
  } catch (err) {
    console.error(`[API /api/webhooks/${webhookId} GET]`, err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { webhookId } = await context.params;
  const session = await getServerSession(authOptions);
  const tenantId = getTenantId(session);

  if (!tenantId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const parsed = updateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const webhook = await updateWebhook({
      id: webhookId,
      tenantId,
      patch: parsed.data,
    });
    return NextResponse.json({ webhook });
  } catch (err) {
    console.error(`[API /api/webhooks/${webhookId} PUT]`, err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
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
    await deleteWebhook({ id: webhookId, tenantId });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[API /api/webhooks/${webhookId} DELETE]`, err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

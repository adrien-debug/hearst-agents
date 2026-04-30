/**
 * GET  /api/webhooks       — liste les webhooks du tenant
 * POST /api/webhooks       — crée un webhook
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/platform/auth/options";
import { listWebhooks, createWebhook, createWebhookSchema } from "@/lib/webhooks/store";
import { z } from "zod";

function getTenantId(session: unknown): string | null {
  const s = session as { user?: { tenantId?: string } } | null;
  return s?.user?.tenantId ?? null;
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId = getTenantId(session);

  if (!tenantId) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const webhooks = await listWebhooks({ tenantId });
    return NextResponse.json({ webhooks });
  } catch (err) {
    console.error("[API /api/webhooks GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
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

  const parsed = createWebhookSchema.safeParse({ ...body as object, tenantId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const webhook = await createWebhook(parsed.data);
    return NextResponse.json({ webhook }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation", issues: err.issues }, { status: 422 });
    }
    console.error("[API /api/webhooks POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

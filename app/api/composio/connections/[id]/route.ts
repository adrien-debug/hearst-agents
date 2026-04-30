/**
 * DELETE /api/composio/connections/[id]
 *
 * Disconnects one of the authenticated user's Composio accounts.
 * The Composio SDK enforces entityId-scoped permissions server-side, so we
 * can't accidentally delete another user's connection.
 *
 * Side effect : si la connexion supportait l'inbox cron (Gmail / Slack /
 * Calendar), on désinscrit le user du repeatable BullMQ pour éviter de
 * polluer la queue avec des fetch sans credentials valides.
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { requireScope } from "@/lib/platform/auth/scope";
import { disconnectAccount, isComposioConfigured } from "@/lib/connectors/composio";
import { unregisterInboxRepeatable } from "@/lib/jobs/scheduled/inbox-cron";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: "composio_not_configured" },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing_connection_id" }, { status: 400 });
  }

  const result = await disconnectAccount(userId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "disconnect_failed" }, { status: 502 });
  }

  // Désinscrit le user du cron inbox (best-effort, non-bloquant). Pas de
  // distinction par provider : `unregisterInboxRepeatable` est idempotent et
  // retire seulement le job Repeatable correspondant à ce user. Si d'autres
  // connexions inbox restent actives, le cron sera réenregistré au prochain
  // boot via `startInboxCron`. Une optimisation serait de re-vérifier ici
  // s'il reste des connexions Gmail/Slack/Calendar et seulement désinscrire
  // si plus aucune — laissé à une itération suivante.
  try {
    const { scope, error: scopeError } = await requireScope({
      context: "DELETE /api/composio/connections/[id]",
    });
    if (!scopeError) {
      await unregisterInboxRepeatable({
        userId: scope.userId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      });
    }
  } catch (err) {
    console.warn("[composio/connections] unregisterInboxRepeatable failed:", err);
  }

  return NextResponse.json({ ok: true });
}

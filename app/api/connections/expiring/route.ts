/**
 * GET /api/connections/expiring
 *
 * Retourne les connexions OAuth de l'utilisateur courant qui expirent
 * dans moins de AUTH_EXPIRING_DAYS_THRESHOLD jours.
 *
 * Utilisé par OAuthExpiryBanner (client-side, lazy load).
 *
 * Format de réponse :
 *   { connections: ExpiringConnection[] }
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { checkExpiringTokens } from "@/lib/connections/oauth-refresh";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // tenantId = userId en mono-tenant (Hearst OS V1).
  // TODO: Charger le tenantId réel depuis la session quand multi-tenant.
  const tenantId = userId;

  try {
    const connections = await checkExpiringTokens({ userId, tenantId });
    return NextResponse.json({ connections });
  } catch (err) {
    console.error("[GET /api/connections/expiring] Erreur:", err);
    return NextResponse.json({ connections: [] });
  }
}

/**
 * GET /api/connections/native
 *
 * Liste les services Google "natifs" déjà accessibles via les tokens
 * NextAuth obtenus au login SSO (cf. lib/platform/auth/options.ts qui demande
 * les scopes Gmail.modify+send / Calendar.events / Drive.file). Ces services
 * sont utilisables par l'agent SANS passer par Composio — donc inutile (et
 * source d'erreurs access_denied) de redemander un OAuth Composio par-dessus.
 *
 * Format de réponse aligné sur /api/composio/connections pour que le
 * frontend puisse les fusionner sans gymnastique :
 *   { connections: [{ id, appName, status, source }] }
 *
 * On ajoute un champ `source: "native"` pour différencier des connexions
 * Composio (`source: "composio"` côté autre endpoint, à ajouter aussi).
 */

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import { getTokenMeta } from "@/lib/platform/auth/tokens";

// Mapping provider → toolkits Composio équivalents. Quand le user a fait le
// SSO Google avec ces scopes, ces 3 slugs sont automatiquement marqués
// connectés dans /apps. Pareil pour Microsoft (Outlook + Calendar + Files).
const NATIVE_GOOGLE_SLUGS = ["gmail", "googlecalendar", "googledrive"];
const NATIVE_MICROSOFT_SLUGS = ["outlook", "office365"];

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const connections: Array<{
    id: string;
    appName: string;
    status: string;
    source: "native";
  }> = [];

  // Google : si on a un refresh ou access token non révoqué, le SSO est valide.
  const googleMeta = await getTokenMeta(userId, "google");
  if (
    !googleMeta.revoked &&
    (googleMeta.tokens.refreshToken || googleMeta.tokens.accessToken)
  ) {
    for (const slug of NATIVE_GOOGLE_SLUGS) {
      connections.push({
        id: `native::google::${slug}`,
        appName: slug,
        status: "ACTIVE",
        source: "native",
      });
    }
  }

  // Microsoft : idem (Azure AD provider). Si le user s'est loggé Outlook
  // SSO, on flag ces toolkits.
  const msMeta = await getTokenMeta(userId, "microsoft");
  if (
    !msMeta.revoked &&
    (msMeta.tokens.refreshToken || msMeta.tokens.accessToken)
  ) {
    for (const slug of NATIVE_MICROSOFT_SLUGS) {
      connections.push({
        id: `native::microsoft::${slug}`,
        appName: slug,
        status: "ACTIVE",
        source: "native",
      });
    }
  }

  return NextResponse.json({ connections });
}

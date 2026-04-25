import { NextResponse } from "next/server";
import { slackConnector } from "@/lib/connectors";
import { SlackApiError } from "@/lib/connectors/slack";
import { getUserId } from "@/lib/get-user-id";
import { getTokens } from "@/lib/platform/auth/tokens";

export const dynamic = "force-dynamic";

const SLACK_ERROR_MAP: Record<string, { status: number; message: string }> = {
  not_authed:            { status: 401, message: "Slack non connecté." },
  invalid_auth:          { status: 401, message: "Slack non connecté. Reconnectez votre compte." },
  token_revoked:         { status: 401, message: "Accès Slack révoqué. Reconnectez votre compte." },
  account_inactive:      { status: 401, message: "Compte Slack inactif." },
  missing_scope:         { status: 403, message: "Permissions Slack insuffisantes. Réinstallez l'app." },
  not_in_channel:        { status: 403, message: "Le bot n'a pas accès à ce canal." },
  no_permission:         { status: 403, message: "Permissions Slack insuffisantes." },
  channel_not_found:     { status: 404, message: "Canal Slack introuvable." },
  ratelimited:           { status: 429, message: "Slack temporairement limité. Réessayez." },
  service_unavailable:   { status: 503, message: "Slack indisponible. Réessayez." },
  internal_error:        { status: 503, message: "Erreur interne Slack. Réessayez." },
  request_timeout:       { status: 504, message: "Slack ne répond pas. Réessayez." },
};

async function resolveSlackUserId(): Promise<string | null> {
  const sessionUserId = await getUserId();
  if (!sessionUserId) return null;
  try {
    const tokens = await getTokens(sessionUserId, "slack");
    if (tokens.accessToken) return sessionUserId;
  } catch {
    // no token for this user
  }
  return null;
}

export async function GET() {
  const userId = await resolveSlackUserId();
  console.log("[Slack Route] userId resolved:", userId ?? "none");

  if (!userId) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Connectez votre compte Slack." },
      { status: 401 },
    );
  }

  try {
    const result = await slackConnector.getMessages(userId, 20);
    return NextResponse.json({ messages: result.data });
  } catch (err: unknown) {
    const code = err instanceof SlackApiError ? err.slackCode : (err instanceof Error ? err.message : "unknown");
    console.error("[Slack Route] Error code:", code);

    const mapped = SLACK_ERROR_MAP[code];
    if (mapped) {
      return NextResponse.json(
        { error: code, message: mapped.message },
        { status: mapped.status },
      );
    }

    return NextResponse.json(
      { error: code, message: "Erreur Slack inattendue." },
      { status: 502 },
    );
  }
}

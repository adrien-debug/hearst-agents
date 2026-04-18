import { NextResponse } from "next/server";
import { slackConnector } from "@/lib/connectors";
import { getUserId } from "@/lib/get-user-id";
import { getTokens } from "@/lib/token-store";

export const dynamic = "force-dynamic";

async function resolveSlackUserId(): Promise<string | null> {
  const sessionUserId = await getUserId();
  if (sessionUserId) {
    const tokens = await getTokens(sessionUserId, "slack");
    if (tokens.accessToken) return sessionUserId;
  }
  const fallback = await getTokens("default", "slack");
  if (fallback.accessToken) return "default";
  return null;
}

export async function GET() {
  const userId = await resolveSlackUserId();
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
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "not_authenticated" || message === "token_revoked") {
      return NextResponse.json(
        { error: "not_authenticated", message: "Connectez votre compte Slack." },
        { status: 401 },
      );
    }

    console.error("[Slack API] Error:", message);
    return NextResponse.json(
      { error: "slack_error", message: "Erreur de lecture Slack." },
      { status: 502 },
    );
  }
}

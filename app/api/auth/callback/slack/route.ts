import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/token-store";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    console.error("[Slack OAuth] Error or missing code:", error);
    return NextResponse.redirect(new URL("/apps?slack=error", request.url));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI ?? `${process.env.NEXTAUTH_URL}/api/auth/callback/slack`;

  if (!clientId || !clientSecret) {
    console.error("[Slack OAuth] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET");
    return NextResponse.redirect(new URL("/apps?slack=error", request.url));
  }

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await tokenRes.json();

    if (!data.ok) {
      console.error("[Slack OAuth] Token exchange failed:", data.error);
      return NextResponse.redirect(new URL("/apps?slack=error", request.url));
    }

    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? "default";

    const botToken = data.access_token;
    const teamId = data.team?.id as string | undefined;
    const teamName = data.team?.name ?? "Slack";
    const slackUserId = data.authed_user?.id as string | undefined;

    await saveTokens(
      userId,
      {
        accessToken: botToken,
        refreshToken: null,
        expiresAt: 0,
      },
      "slack",
      { tenantId: teamId },
    );

    console.log(
      `[Slack OAuth] Connected workspace "${teamName}" (team=${teamId ?? "?"}, slackUser=${slackUserId ?? "?"}) for user ${userId}`,
    );

    return NextResponse.redirect(new URL("/apps?slack=connected", request.url));
  } catch (err) {
    console.error("[Slack OAuth] Exchange error:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/apps?slack=error", request.url));
  }
}

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID not configured" }, { status: 500 });
  }

  const scopes = [
    "channels:read",
    "channels:history",
    "im:read",
    "im:history",
    "users:read",
    "groups:read",
    "groups:history",
    "mpim:read",
    "mpim:history",
  ].join(",");

  const redirectUri = process.env.SLACK_REDIRECT_URI ?? `${process.env.NEXTAUTH_URL}/api/auth/callback/slack`;

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(url.toString());
}

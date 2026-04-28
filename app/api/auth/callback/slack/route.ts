import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/platform/auth/tokens";
import { registerProviderUsage } from "@/lib/connectors/control-plane/register";

interface StatePayload {
  v: string; // codeVerifier
  u: string; // userId
  t?: string; // tenantId (optional, for multi-tenant)
  w?: string; // workspaceId (optional)
}

function parseState(raw: string | null): StatePayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:9000";

  if (error || !code) {
    console.error("[Slack OAuth] Error or missing code:", error);
    return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI ?? `${appUrl}/api/auth/callback/slack`;

  if (!clientId || !clientSecret) {
    console.error("[Slack OAuth] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET");
    return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
  }

  const state = parseState(request.nextUrl.searchParams.get("state"));
  if (!state) {
    console.error("[Slack OAuth] Missing or invalid state parameter");
    return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
  }

  const { v: codeVerifier, u: userId, t: stateTenantId, w: stateWorkspaceId } = state;

  // Resolve scope from state or env (state carries scope for session-independent OAuth)
  const tenantId = stateTenantId ?? process.env.HEARST_TENANT_ID ?? "dev-tenant";
  const workspaceId = stateWorkspaceId ?? process.env.HEARST_WORKSPACE_ID ?? "dev-workspace";

  try {
    const body: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    };

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    const data = await tokenRes.json();

    if (!data.ok) {
      console.error("[Slack OAuth] Token exchange failed:", data.error);
      return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
    }

    const userToken = data.authed_user?.access_token as string | undefined;
    const botToken = data.access_token as string | undefined;
    const token = userToken ?? botToken;

    if (!token) {
      console.error("[Slack OAuth] No token in response");
      return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
    }

    const teamId = data.team?.id as string | undefined;
    const teamName = data.team?.name ?? "Slack";
    const slackUserId = data.authed_user?.id as string | undefined;
    const refreshToken = (data.authed_user?.refresh_token ?? data.refresh_token ?? null) as string | null;
    const expiresIn = (data.authed_user?.expires_in ?? data.expires_in ?? 0) as number;

    await saveTokens(
      userId,
      {
        accessToken: token,
        refreshToken,
        expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
      },
      "slack",
      { tenantId: teamId },
    );

    void registerProviderUsage({
      provider: "slack",
      scope: {
        tenantId: teamId ?? tenantId,
        workspaceId,
        userId,
      },
    });

    return NextResponse.redirect(new URL("/apps?slack=connected", appUrl));
  } catch (err) {
    console.error("[Slack OAuth] Exchange error:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/apps?slack=error", appUrl));
  }
}

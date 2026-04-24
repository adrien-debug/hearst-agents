import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserId } from "@/lib/get-user-id";

// Helper to resolve dev scope (same logic as lib/scope.ts, but sync)
function resolveDevScope(): { tenantId: string; workspaceId: string } {
  return {
    tenantId: process.env.HEARST_TENANT_ID ?? "dev-tenant",
    workspaceId: process.env.HEARST_WORKSPACE_ID ?? "dev-workspace",
  };
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID not configured" }, { status: 500 });
  }

  const userScopes = [
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

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:9000";
  const redirectUri = process.env.SLACK_REDIRECT_URI ?? `${baseUrl}/api/auth/callback/slack`;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("user_scope", userScopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  // Encode verifier + userId + scope into the OAuth `state` param so the callback
  // can read them from the URL — cookies don't survive cross-domain redirects
  // (localhost → ngrok). Scope is required for multi-tenant isolation.
  const { tenantId, workspaceId } = resolveDevScope();
  const statePayload = Buffer.from(
    JSON.stringify({ v: codeVerifier, u: userId, t: tenantId, w: workspaceId }),
  ).toString("base64url");

  url.searchParams.set("state", statePayload);

  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  });
}

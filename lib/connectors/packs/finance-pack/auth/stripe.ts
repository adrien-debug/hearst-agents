/**
 * Stripe Connector — OAuth Handler
 *
 * Architecture Finale: lib/connectors/packs/finance-pack/auth/
 *
 * Two auth strategies:
 * - Nango-managed OAuth (recommended): delegates entirely to Nango
 * - Direct API key: for self-hosted / restricted accounts
 */

import { getNangoClient, isNangoEnabled } from "@/lib/connectors/nango/client";
import { buildConnectionId } from "@/lib/connectors/nango/proxy";

export interface StripeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Initiate Stripe OAuth via Nango.
 * Returns the Nango-hosted auth URL the user should be redirected to.
 */
export async function initiateStripeOAuth(
  _config: StripeOAuthConfig,
  userId: string,
): Promise<string> {
  if (!isNangoEnabled()) {
    throw new Error(
      "NANGO_SECRET_KEY is not configured. Set it in .env.local to enable Stripe OAuth.",
    );
  }

  const connectionId = buildConnectionId(userId, "stripe");
  const nangoHost = process.env.NANGO_HOST || "https://api.nango.dev";
  const publicKey = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error("NEXT_PUBLIC_NANGO_PUBLIC_KEY is required for Stripe OAuth.");
  }

  return `${nangoHost}/oauth/connect/stripe?public_key=${publicKey}&connection_id=${connectionId}`;
}

/**
 * Handle Stripe OAuth callback — token exchange is handled by Nango.
 * This function verifies the connection and returns Stripe account info.
 */
export async function handleStripeCallback(
  connectionId: string,
): Promise<{ accessToken: string; refreshToken?: string; accountId: string }> {
  if (!isNangoEnabled()) {
    throw new Error("NANGO_SECRET_KEY is not configured.");
  }

  const nango = getNangoClient();

  const connection = await nango.getConnection("stripe", connectionId);

  const credentials = connection.credentials as {
    access_token?: string;
    refresh_token?: string;
    stripe_user_id?: string;
    raw?: Record<string, unknown>;
  };

  if (!credentials.access_token) {
    throw new Error("Stripe OAuth: no access_token received from Nango.");
  }

  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token,
    accountId:
      credentials.stripe_user_id ??
      (credentials.raw?.stripe_user_id as string) ??
      "unknown",
  };
}

/**
 * Verify that a user's Stripe connection is still active via Nango.
 */
export async function verifyStripeConnection(userId: string): Promise<boolean> {
  if (!isNangoEnabled()) return false;

  try {
    const nango = getNangoClient();
    const connectionId = buildConnectionId(userId, "stripe");
    const conn = await nango.getConnection("stripe", connectionId);
    return !!conn;
  } catch {
    return false;
  }
}

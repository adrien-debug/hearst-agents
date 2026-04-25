/**
 * HubSpot Connector — OAuth Handler
 *
 * Path: lib/connectors/packs/crm-pack/auth/hubspot.ts
 */

export interface HubSpotOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface HubSpotTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainedAt: number;
}

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

/**
 * Generate HubSpot OAuth authorization URL
 */
export function generateHubSpotAuthUrl(
  config: HubSpotOAuthConfig,
  state: string,
  scopes: string[] = ["crm.objects.contacts.read"]
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(" "),
    state: state,
  });

  return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeHubSpotCode(
  code: string,
  config: HubSpotOAuthConfig
): Promise<HubSpotTokens> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code: code,
  });

  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

/**
 * Refresh access token
 */
export async function refreshHubSpotToken(
  refreshToken: string,
  config: HubSpotOAuthConfig
): Promise<HubSpotTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

/**
 * Check if token needs refresh
 */
export function isTokenExpired(tokens: HubSpotTokens, bufferSeconds = 300): boolean {
  const expiresAt = tokens.obtainedAt + tokens.expiresIn * 1000;
  return Date.now() > expiresAt - bufferSeconds * 1000;
}

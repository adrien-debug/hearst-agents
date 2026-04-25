/**
 * Figma Connector — OAuth Handler
 *
 * Path: lib/connectors/packs/design-pack/auth/figma.ts
 */

export interface FigmaOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface FigmaTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  obtainedAt: number;
  userId: string;
}

const FIGMA_AUTH_URL = "https://www.figma.com/oauth";
const FIGMA_TOKEN_URL = "https://www.figma.com/api/oauth/token";

/**
 * Generate Figma OAuth authorization URL
 */
export function generateFigmaAuthUrl(
  config: FigmaOAuthConfig,
  state: string,
  scopes: string[] = ["files:read"]
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(","),
    state: state,
    response_type: "code",
  });

  return `${FIGMA_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeFigmaCode(
  code: string,
  config: FigmaOAuthConfig
): Promise<FigmaTokens> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code: code,
    grant_type: "authorization_code",
  });

  const response = await fetch(`${FIGMA_TOKEN_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Figma token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
    userId: data.user_id,
  };
}

/**
 * Refresh access token (if refresh token available)
 */
export async function refreshFigmaToken(
  refreshToken: string,
  config: FigmaOAuthConfig
): Promise<FigmaTokens> {
  // Figma refresh flow
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(`${FIGMA_TOKEN_URL}?${params.toString()}`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Figma token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
    userId: data.user_id,
  };
}

/**
 * Check if token needs refresh
 */
export function isFigmaTokenExpired(
  tokens: FigmaTokens,
  bufferSeconds = 300
): boolean {
  if (!tokens.expiresIn) return false; // No expiration

  const expiresAt = tokens.obtainedAt + tokens.expiresIn * 1000;
  return Date.now() > expiresAt - bufferSeconds * 1000;
}

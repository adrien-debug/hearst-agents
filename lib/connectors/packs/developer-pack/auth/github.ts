/**
 * GitHub Connector — OAuth Handler
 *
 * Path: lib/connectors/packs/developer-pack/auth/github.ts
 */

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GitHubTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  obtainedAt: number;
  scope: string;
}

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/**
 * Generate GitHub OAuth authorization URL
 */
export function generateGitHubAuthUrl(
  config: GitHubOAuthConfig,
  state: string,
  scopes: string[] = ["repo", "read:user"]
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(" "),
    state: state,
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGitHubCode(
  code: string,
  config: GitHubOAuthConfig
): Promise<GitHubTokens> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
    scope: data.scope || "",
  };
}

/**
 * Check if token needs refresh
 * Note: GitHub tokens don't expire by default, but we keep this for compatibility
 */
export function isTokenExpired(tokens: GitHubTokens, bufferSeconds = 300): boolean {
  if (!tokens.expiresIn) {
    return false; // GitHub tokens don't expire by default
  }
  const expiresAt = tokens.obtainedAt + tokens.expiresIn * 1000;
  return Date.now() > expiresAt - bufferSeconds * 1000;
}

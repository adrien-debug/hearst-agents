/**
 * Notion Connector — OAuth Handler
 *
 * Path: lib/connectors/packs/productivity-pack/auth/notion.ts
 */

export interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface NotionTokens {
  accessToken: string;
  botId: string;
  workspaceName: string;
  workspaceIcon?: string;
  expiresIn?: number;
  obtainedAt: number;
}

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

/**
 * Generate Notion OAuth authorization URL
 */
export function generateNotionAuthUrl(
  config: NotionOAuthConfig,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    owner: "user",
    state: state,
  });

  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeNotionCode(
  code: string,
  config: NotionOAuthConfig
): Promise<NotionTokens> {
  // Notion uses Basic auth with client_id:client_secret
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64");

  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    botId: data.bot_id,
    workspaceName: data.workspace_name,
    workspaceIcon: data.workspace_icon,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

/**
 * Check if token is expired (Notion tokens typically don't expire)
 */
export function isNotionTokenExpired(
  tokens: NotionTokens,
  _bufferSeconds = 300
): boolean {
  // Notion access tokens don't expire by default
  // But we can check if there's an expiresIn and validate
  if (!tokens.expiresIn) return false;

  const expiresAt = tokens.obtainedAt + tokens.expiresIn * 1000;
  return Date.now() > expiresAt;
}

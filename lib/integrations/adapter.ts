/**
 * Integration Adapter — abstract contract for all external service integrations.
 *
 * Every integration adapter must:
 *   - declare supported actions (read-only for Phase 1)
 *   - resolve auth from IntegrationConnection credentials
 *   - translate input → external API call → structured output
 *   - never expose secrets in outputs
 */

export type IntegrationAuthType = "none" | "api_key" | "oauth2" | "bearer";

export interface IntegrationCredentials {
  api_key?: string;
  bearer_token?: string;
  oauth_access_token?: string;
  oauth_refresh_token?: string;
  [key: string]: unknown;
}

export interface AdapterAction {
  name: string;
  description: string;
  readonly: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export interface AdapterResult {
  success: boolean;
  data: unknown;
  status: number;
  latency_ms: number;
  error?: string;
}

export interface IntegrationAdapter {
  readonly provider: string;
  readonly actions: AdapterAction[];

  execute(
    action: string,
    input: Record<string, unknown>,
    credentials: IntegrationCredentials,
    config?: Record<string, unknown>,
  ): Promise<AdapterResult>;

  healthCheck(credentials: IntegrationCredentials): Promise<{
    healthy: boolean;
    latency_ms: number;
    error?: string;
  }>;
}

/**
 * NotionAdapter — Notion API integration (read-only Phase 1).
 *
 * Action: notion.read_page — reads a Notion page by ID.
 * Auth: bearer token (Notion internal integration token).
 * Safety: read-only, no mutations, no secrets in output.
 */

import type {
  IntegrationAdapter,
  AdapterAction,
  AdapterResult,
  IntegrationCredentials,
} from "./adapter";

const NOTION_API_VERSION = "2022-06-28";
const NOTION_BASE_URL = "https://api.notion.com/v1";

const NOTION_READ_PAGE_ACTION: AdapterAction = {
  name: "notion.read_page",
  description: "Read a Notion page by ID (properties + content blocks)",
  readonly: true,
  input_schema: {
    type: "object",
    properties: {
      page_id: { type: "string", description: "Notion page ID (UUID)" },
      include_blocks: { type: "boolean", description: "Also fetch child blocks (default: true)" },
    },
    required: ["page_id"],
  },
  output_schema: {
    type: "object",
    properties: {
      page: { description: "Page metadata and properties" },
      blocks: { description: "Child blocks content (if requested)" },
    },
  },
};

export class NotionAdapter implements IntegrationAdapter {
  readonly provider = "notion";
  readonly actions = [NOTION_READ_PAGE_ACTION];

  async execute(
    action: string,
    input: Record<string, unknown>,
    credentials: IntegrationCredentials,
  ): Promise<AdapterResult> {
    if (action !== "notion.read_page") {
      return { success: false, data: null, status: 0, latency_ms: 0, error: `Unknown action: ${action}` };
    }

    const pageId = input.page_id as string | undefined;
    if (!pageId) {
      return { success: false, data: null, status: 0, latency_ms: 0, error: "Missing required field: page_id" };
    }

    const token = credentials.bearer_token ?? credentials.api_key;
    if (!token) {
      return { success: false, data: null, status: 0, latency_ms: 0, error: "Missing Notion API token" };
    }

    const includeBlocks = input.include_blocks !== false;
    const headers = this.buildHeaders(token);
    const start = Date.now();

    try {
      const pageRes = await fetch(`${NOTION_BASE_URL}/pages/${pageId}`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!pageRes.ok) {
        const errBody = await pageRes.text().catch(() => "");
        return {
          success: false,
          data: { status: pageRes.status, error: errBody },
          status: pageRes.status,
          latency_ms: Date.now() - start,
          error: `Notion API returned ${pageRes.status}`,
        };
      }

      const page = await pageRes.json();
      let blocks: unknown = null;

      if (includeBlocks) {
        const blocksRes = await fetch(`${NOTION_BASE_URL}/blocks/${pageId}/children?page_size=100`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(15_000),
        });

        if (blocksRes.ok) {
          blocks = await blocksRes.json();
        }
      }

      const latency = Date.now() - start;

      return {
        success: true,
        data: { page: this.sanitizePage(page), blocks },
        status: 200,
        latency_ms: latency,
      };
    } catch (e) {
      const latency = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        data: null,
        status: 0,
        latency_ms: latency,
        error: msg.includes("abort") ? "Notion API timeout" : msg,
      };
    }
  }

  async healthCheck(credentials: IntegrationCredentials): Promise<{
    healthy: boolean;
    latency_ms: number;
    error?: string;
  }> {
    const token = credentials.bearer_token ?? credentials.api_key;
    if (!token) {
      return { healthy: false, latency_ms: 0, error: "No token configured" };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${NOTION_BASE_URL}/users/me`, {
        method: "GET",
        headers: this.buildHeaders(token),
        signal: AbortSignal.timeout(5000),
      });

      return { healthy: res.ok, latency_ms: Date.now() - start };
    } catch (e) {
      return {
        healthy: false,
        latency_ms: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private buildHeaders(token: string): Record<string, string> {
    return {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    };
  }

  private sanitizePage(page: Record<string, unknown>): Record<string, unknown> {
    const { id, created_time, last_edited_time, properties, url, icon, cover } = page;
    return { id, created_time, last_edited_time, properties, url, icon, cover };
  }
}

/**
 * Notion Connector — API Service
 *
 * Path: lib/connectors/packs/productivity-pack/services/notion.ts
 */

import {
  NotionPageSchema,
  NotionDatabaseSchema,
  NotionBlockSchema,
  NotionUserSchema,
  type NotionPage,
  type NotionDatabase,
  type NotionBlock,
  type NotionUser,
} from "../schemas/notion";

interface NotionConfig {
  accessToken: string;
  baseUrl?: string;
}

export class NotionApiService {
  private accessToken: string;
  private baseUrl: string;

  constructor(config: NotionConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl || "https://api.notion.com/v1";
  }

  /**
   * Make authenticated request to Notion API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
    } = {}
  ): Promise<T> {
    const { method = "GET", body } = options;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new NotionApiError(
        errorData.message || `Notion API error: ${response.status}`,
        response.status,
        errorData.code || "unknown_error"
      );
    }

    return response.json() as T;
  }

  // ==================== Users ====================

  /**
   * Get current user (bot)
   */
  async getCurrentUser(): Promise<NotionUser> {
    const data = await this.request<unknown>("/users/me");
    return NotionUserSchema.parse(data);
  }

  /**
   * List users in workspace
   */
  async listUsers(params?: {
    startCursor?: string;
    pageSize?: number;
  }): Promise<{ results: NotionUser[]; nextCursor?: string; hasMore: boolean }> {
    const data = await this.request<{
      results: unknown[];
      next_cursor?: string;
      has_more: boolean;
    }>("/users", {
      method: "GET",
    });

    return {
      results: data.results.map((r) => NotionUserSchema.parse(r)),
      nextCursor: data.next_cursor,
      hasMore: data.has_more,
    };
  }

  // ==================== Pages ====================

  /**
   * Get a page by ID
   */
  async getPage(pageId: string): Promise<NotionPage | null> {
    try {
      const data = await this.request<unknown>(`/pages/${pageId}`);
      return NotionPageSchema.parse(data);
    } catch (err) {
      if (err instanceof NotionApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a new page
   */
  async createPage(input: {
    parent: { database_id?: string; page_id?: string };
    properties: Record<string, unknown>;
    content?: unknown[];
  }): Promise<NotionPage> {
    const data = await this.request<unknown>("/pages", {
      method: "POST",
      body: {
        parent: input.parent.database_id
          ? { database_id: input.parent.database_id }
          : { page_id: input.parent.page_id },
        properties: input.properties,
        children: input.content,
      },
    });

    return NotionPageSchema.parse(data);
  }

  /**
   * Update page properties
   */
  async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
    archived?: boolean
  ): Promise<NotionPage> {
    const data = await this.request<unknown>(`/pages/${pageId}`, {
      method: "PATCH",
      body: {
        properties,
        archived,
      },
    });

    return NotionPageSchema.parse(data);
  }

  // ==================== Databases ====================

  /**
   * Get a database by ID
   */
  async getDatabase(databaseId: string): Promise<NotionDatabase | null> {
    try {
      const data = await this.request<unknown>(`/databases/${databaseId}`);
      return NotionDatabaseSchema.parse(data);
    } catch (err) {
      if (err instanceof NotionApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Query database entries
   */
  async queryDatabase(
    databaseId: string,
    params?: {
      filter?: Record<string, unknown>;
      sorts?: unknown[];
      startCursor?: string;
      pageSize?: number;
    }
  ): Promise<{
    results: NotionPage[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const data = await this.request<{
      results: unknown[];
      next_cursor?: string;
      has_more: boolean;
    }>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: {
        filter: params?.filter,
        sorts: params?.sorts,
        start_cursor: params?.startCursor,
        page_size: params?.pageSize,
      },
    });

    return {
      results: data.results.map((r) => NotionPageSchema.parse(r)),
      nextCursor: data.next_cursor,
      hasMore: data.has_more,
    };
  }

  // ==================== Blocks (Content) ====================

  /**
   * Get block children (page content)
   */
  async getBlockChildren(
    blockId: string,
    params?: {
      startCursor?: string;
      pageSize?: number;
    }
  ): Promise<{
    results: NotionBlock[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.startCursor) searchParams.append("start_cursor", params.startCursor);
    if (params?.pageSize) searchParams.append("page_size", String(params.pageSize));

    const queryString = searchParams.toString();
    const endpoint = `/blocks/${blockId}/children${queryString ? `?${queryString}` : ""}`;

    const data = await this.request<{
      results: unknown[];
      next_cursor?: string;
      has_more: boolean;
    }>(endpoint);

    return {
      results: data.results.map((r) => NotionBlockSchema.parse(r)),
      nextCursor: data.next_cursor,
      hasMore: data.has_more,
    };
  }

  /**
   * Append block children (add content)
   */
  async appendBlockChildren(
    blockId: string,
    children: unknown[]
  ): Promise<{ results: NotionBlock[] }> {
    const data = await this.request<{
      results: unknown[];
    }>(`/blocks/${blockId}/children`, {
      method: "PATCH",
      body: { children },
    });

    return {
      results: data.results.map((r) => NotionBlockSchema.parse(r)),
    };
  }

  // ==================== Search ====================

  /**
   * Search pages and databases
   */
  async search(
    query: string,
    params?: {
      filter?: { value: "page" | "database" | "object" };
      sort?: { direction: "ascending" | "descending"; timestamp: "last_edited_time" };
      startCursor?: string;
      pageSize?: number;
    }
  ): Promise<{
    results: Array<NotionPage | NotionDatabase>;
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const data = await this.request<{
      results: Array<{ object: string; [key: string]: unknown }>;
      next_cursor?: string;
      has_more: boolean;
    }>("/search", {
      method: "POST",
      body: {
        query,
        filter: params?.filter,
        sort: params?.sort,
        start_cursor: params?.startCursor,
        page_size: params?.pageSize,
      },
    });

    return {
      results: data.results.map((r) => {
        if (r.object === "page") {
          return NotionPageSchema.parse(r);
        } else {
          return NotionDatabaseSchema.parse(r);
        }
      }),
      nextCursor: data.next_cursor,
      hasMore: data.has_more,
    };
  }

  // ==================== Health Check ====================

  /**
   * Check API connectivity
   */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request<{ object: string }>("/users/me");
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * Notion API Error
 */
export class NotionApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "NotionApiError";
    this.status = status;
    this.code = code;
  }
}

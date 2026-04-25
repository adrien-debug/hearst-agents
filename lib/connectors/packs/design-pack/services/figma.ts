/**
 * Figma Connector — API Service
 *
 * Path: lib/connectors/packs/design-pack/services/figma.ts
 */

import {
  FigmaFileSchema,
  FigmaProjectSchema,
  FigmaTeamSchema,
  FigmaComponentSchema,
  FigmaComponentSetSchema,
  FigmaStyleSchema,
  FigmaVariableSchema,
  FigmaVariableCollectionSchema,
  FigmaCommentSchema,
  type FigmaFile,
  type FigmaProject,
  type FigmaTeam,
  type FigmaComponent,
  type FigmaComponentSet,
  type FigmaStyle,
  type FigmaVariable,
  type FigmaVariableCollection,
  type FigmaComment,
} from "../schemas/figma";

interface FigmaConfig {
  accessToken: string;
  baseUrl?: string;
}

export class FigmaApiService {
  private accessToken: string;
  private baseUrl: string;

  constructor(config: FigmaConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl || "https://api.figma.com/v1";
  }

  /**
   * Make authenticated request to Figma API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    } = {}
  ): Promise<T> {
    const { method = "GET", params, body } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        "X-Figma-Token": this.accessToken,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new FigmaApiError(
        errorData.message || errorData.err || `Figma API error: ${response.status}`,
        response.status,
        errorData.status || "unknown"
      );
    }

    return response.json() as T;
  }

  // ==================== User ====================

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<{
    id: string;
    email: string;
    handle: string;
    img_url: string;
  }> {
    return this.request("/me");
  }

  // ==================== Files ====================

  /**
   * Get file by key
   */
  async getFile(
    fileKey: string,
    params?: {
      version?: string;
      depth?: number;
      branch_data?: boolean;
    }
  ): Promise<FigmaFile & { document?: unknown; components?: Record<string, FigmaComponent> }> {
    const data = await this.request<unknown>(`/files/${fileKey}`, { params });
    return {
      ...FigmaFileSchema.parse(data),
      ...(data as { document?: unknown; components?: Record<string, FigmaComponent> }),
    };
  }

  /**
   * Get file nodes (specific nodes by ID)
   */
  async getFileNodes(
    fileKey: string,
    nodeIds: string[],
    params?: {
      version?: string;
      depth?: number;
    }
  ): Promise<{
    name: string;
    lastModified: string;
    thumbnailUrl: string;
    nodes: Record<string, { document: unknown; components: unknown[]; componentSets: unknown[] }>;
  }> {
    return this.request(`/files/${fileKey}/nodes`, {
      params: {
        ...params,
        ids: nodeIds.join(","),
      },
    });
  }

  /**
   * Get file versions (history)
   */
  async getFileVersions(
    fileKey: string,
    params?: { before?: number; pageSize?: number }
  ): Promise<{
    versions: Array<{
      id: string;
      created_at: string;
      label: string;
      description: string;
      user: { id: string; handle: string };
      thumbnail_url: string;
    }>;
    pagination: { before: number; page_size: number };
  }> {
    return this.request(`/files/${fileKey}/versions`, { params });
  }

  // ==================== Projects & Teams ====================

  /**
   * Get team projects
   */
  async getTeamProjects(teamId: string): Promise<{
    projects: FigmaProject[];
  }> {
    const data = await this.request<{ projects: unknown[] }>(`/teams/${teamId}/projects`);
    return {
      projects: data.projects.map((p) => FigmaProjectSchema.parse(p)),
    };
  }

  /**
   * Get project files
   */
  async getProjectFiles(
    projectId: string,
    params?: { branch_data?: boolean }
  ): Promise<{
    files: FigmaFile[];
  }> {
    const data = await this.request<{ files: unknown[] }>(`/projects/${projectId}/files`, {
      params,
    });
    return {
      files: data.files.map((f) => FigmaFileSchema.parse(f)),
    };
  }

  /**
   * List user's teams
   */
  async getUserTeams(): Promise<{ teams: FigmaTeam[] }> {
    const data = await this.request<{ teams: unknown[] }>("/v1/teams");
    return {
      teams: data.teams.map((t) => FigmaTeamSchema.parse(t)),
    };
  }

  // ==================== Components ====================

  /**
   * Get team components (library)
   */
  async getTeamComponents(
    teamId: string,
    params?: { page_size?: number; cursor?: string }
  ): Promise<{
    meta: {
      components: FigmaComponent[];
      cursor?: string;
    };
  }> {
    const data = await this.request<{
      meta: { components: unknown[]; cursor?: string };
    }>(`/teams/${teamId}/components`, { params });
    return {
      meta: {
        components: data.meta.components.map((c) => FigmaComponentSchema.parse(c)),
        cursor: data.meta.cursor,
      },
    };
  }

  /**
   * Get file components
   */
  async getFileComponents(fileKey: string): Promise<{
    components: Record<string, FigmaComponent>;
    componentSets: Record<string, FigmaComponentSet>;
  }> {
    const data = await this.request<{
      meta: {
        components?: Record<string, unknown>;
        component_sets?: Record<string, unknown>;
      };
    }>(`/files/${fileKey}/components`);

    const components: Record<string, FigmaComponent> = {};
    const componentSets: Record<string, FigmaComponentSet> = {};

    if (data.meta.components) {
      for (const [key, value] of Object.entries(data.meta.components)) {
        components[key] = FigmaComponentSchema.parse(value);
      }
    }

    if (data.meta.component_sets) {
      for (const [key, value] of Object.entries(data.meta.component_sets)) {
        componentSets[key] = FigmaComponentSetSchema.parse(value);
      }
    }

    return { components, componentSets };
  }

  // ==================== Styles ====================

  /**
   * Get file styles
   */
  async getFileStyles(fileKey: string): Promise<{
    meta: { styles: FigmaStyle[] };
  }> {
    const data = await this.request<{
      meta: { styles: unknown[] };
    }>(`/files/${fileKey}/styles`);
    return {
      meta: {
        styles: data.meta.styles.map((s) => FigmaStyleSchema.parse(s)),
      },
    };
  }

  // ==================== Variables (Design Tokens) ====================

  /**
   * Get local variables in a file
   */
  async getLocalVariables(fileKey: string): Promise<{
    status: number;
    error: boolean;
    meta: {
      variableCollections: Record<string, FigmaVariableCollection>;
      variables: Record<string, FigmaVariable>;
    };
  }> {
    const data = await this.request<{
      status: number;
      error: boolean;
      meta: {
        variableCollections: Record<string, unknown>;
        variables: Record<string, unknown>;
      };
    }>(`/files/${fileKey}/variables/local`);

    const collections: Record<string, FigmaVariableCollection> = {};
    const variables: Record<string, FigmaVariable> = {};

    for (const [key, value] of Object.entries(data.meta.variableCollections)) {
      collections[key] = FigmaVariableCollectionSchema.parse(value);
    }

    for (const [key, value] of Object.entries(data.meta.variables)) {
      variables[key] = FigmaVariableSchema.parse(value);
    }

    return {
      status: data.status,
      error: data.error,
      meta: {
        variableCollections: collections,
        variables,
      },
    };
  }

  /**
   * Get published variables from a library
   */
  async getPublishedVariables(fileKey: string): Promise<{
    status: number;
    error: boolean;
    meta: {
      variableCollections: Record<string, FigmaVariableCollection>;
      variables: Record<string, FigmaVariable>;
    };
  }> {
    const data = await this.request<{
      status: number;
      error: boolean;
      meta: {
        variableCollections: Record<string, unknown>;
        variables: Record<string, unknown>;
      };
    }>(`/files/${fileKey}/variables/published`);

    const collections: Record<string, FigmaVariableCollection> = {};
    const variables: Record<string, FigmaVariable> = {};

    for (const [key, value] of Object.entries(data.meta.variableCollections)) {
      collections[key] = FigmaVariableCollectionSchema.parse(value);
    }

    for (const [key, value] of Object.entries(data.meta.variables)) {
      variables[key] = FigmaVariableSchema.parse(value);
    }

    return {
      status: data.status,
      error: data.error,
      meta: {
        variableCollections: collections,
        variables,
      },
    };
  }

  // ==================== Comments ====================

  /**
   * Get file comments
   */
  async getComments(fileKey: string): Promise<{
    comments: FigmaComment[];
  }> {
    const data = await this.request<{ comments: unknown[] }>(`/files/${fileKey}/comments`);
    return {
      comments: data.comments.map((c) => FigmaCommentSchema.parse(c)),
    };
  }

  /**
   * Post a comment
   */
  async postComment(
    fileKey: string,
    message: string,
    clientMeta: { x: number; y: number; node_id?: string }
  ): Promise<FigmaComment> {
    const data = await this.request<unknown>(`/files/${fileKey}/comments`, {
      method: "POST",
      body: {
        message,
        client_meta: clientMeta,
      },
    });
    return FigmaCommentSchema.parse(data);
  }

  /**
   * Delete a comment
   */
  async deleteComment(fileKey: string, commentId: string): Promise<void> {
    await this.request(`/files/${fileKey}/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  // ==================== Health Check ====================

  /**
   * Check API connectivity
   */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request("/me");
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * Figma API Error
 */
export class FigmaApiError extends Error {
  status: number;
  category: string;

  constructor(message: string, status: number, category: string) {
    super(message);
    this.name = "FigmaApiError";
    this.status = status;
    this.category = category;
  }
}

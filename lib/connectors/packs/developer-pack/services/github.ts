/**
 * GitHub Connector — API Service
 *
 * GitHub REST API wrapper.
 * Path: lib/connectors/packs/developer-pack/services/github.ts
 */

import {
  GitHubRepoSchema,
  GitHubIssueSchema,
  GitHubPullRequestSchema,
  GitHubCommitSchema,
  GitHubCodeSearchItemSchema,
  GitHubSearchResponseSchema,
  type GitHubRepo,
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubCommit,
  type GitHubCodeSearchItem,
  type GitHubSearchResponse,
} from "../schemas/github";

interface GitHubConfig {
  accessToken: string;
  baseUrl?: string;
}

export class GitHubApiService {
  private accessToken: string;
  private baseUrl: string;

  constructor(config: GitHubConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl || "https://api.github.com";
  }

  /**
   * Make authenticated request to GitHub API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      params?: Record<string, string | number | undefined>;
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
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "Hearst-OS/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new GitHubApiError(
        errorData.message || `GitHub API error: ${response.status}`,
        response.status,
        errorData.documentation_url || ""
      );
    }

    return response.json() as T;
  }

  // ==================== Repositories ====================

  /**
   * List authenticated user repos
   */
  async listRepos(options?: {
    type?: "all" | "owner" | "member";
    sort?: "created" | "updated" | "pushed" | "full_name";
    direction?: "asc" | "desc";
    per_page?: number;
    page?: number;
  }): Promise<{ results: GitHubRepo[] }> {
    const data = await this.request<unknown[]>("/user/repos", {
      params: {
        type: options?.type || "owner",
        sort: options?.sort || "updated",
        direction: options?.direction || "desc",
        per_page: options?.per_page || 30,
        page: options?.page || 1,
      },
    });

    return {
      results: data.map((r) => GitHubRepoSchema.parse(r)),
    };
  }

  /**
   * Get a single repo
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepo | null> {
    try {
      const data = await this.request<unknown>(`/repos/${owner}/${repo}`);
      return GitHubRepoSchema.parse(data);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Issues ====================

  /**
   * List repo issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<{ results: GitHubIssue[] }> {
    const data = await this.request<unknown[]>(`/repos/${owner}/${repo}/issues`, {
      params: {
        state: options?.state || "open",
        sort: options?.sort || "created",
        direction: options?.direction || "desc",
        per_page: options?.per_page || 30,
        page: options?.page || 1,
      },
    });

    return {
      results: data.map((i) => GitHubIssueSchema.parse(i)),
    };
  }

  /**
   * Get a single issue
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue | null> {
    try {
      const data = await this.request<unknown>(
        `/repos/${owner}/${repo}/issues/${issueNumber}`
      );
      return GitHubIssueSchema.parse(data);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Pull Requests ====================

  /**
   * List repo pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      sort?: "created" | "updated" | "popularity" | "long-running";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<{ results: GitHubPullRequest[] }> {
    const data = await this.request<unknown[]>(`/repos/${owner}/${repo}/pulls`, {
      params: {
        state: options?.state || "open",
        sort: options?.sort || "created",
        direction: options?.direction || "desc",
        per_page: options?.per_page || 30,
        page: options?.page || 1,
      },
    });

    return {
      results: data.map((pr) => GitHubPullRequestSchema.parse(pr)),
    };
  }

  /**
   * Get a single pull request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<GitHubPullRequest | null> {
    try {
      const data = await this.request<unknown>(
        `/repos/${owner}/${repo}/pulls/${prNumber}`
      );
      return GitHubPullRequestSchema.parse(data);
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  // ==================== Commits ====================

  /**
   * List repo commits
   */
  async listCommits(
    owner: string,
    repo: string,
    options?: {
      sha?: string;
      path?: string;
      author?: string;
      since?: string;
      until?: string;
      per_page?: number;
      page?: number;
    }
  ): Promise<{ results: GitHubCommit[] }> {
    const data = await this.request<unknown[]>(`/repos/${owner}/${repo}/commits`, {
      params: {
        sha: options?.sha,
        path: options?.path,
        author: options?.author,
        since: options?.since,
        until: options?.until,
        per_page: options?.per_page || 30,
        page: options?.page || 1,
      },
    });

    return {
      results: data.map((c) => GitHubCommitSchema.parse(c)),
    };
  }

  // ==================== Search ====================

  /**
   * Search code
   */
  async searchCode(query: string): Promise<{
    totalCount: number;
    incompleteResults: boolean;
    items: GitHubCodeSearchItem[];
  }> {
    const data = await this.request<GitHubSearchResponse>("/search/code", {
      params: { q: query },
    });

    const validated = GitHubSearchResponseSchema.parse(data);

    return {
      totalCount: validated.total_count,
      incompleteResults: validated.incomplete_results,
      items: validated.items.map((item) =>
        GitHubCodeSearchItemSchema.parse(item)
      ),
    };
  }

  /**
   * Search issues
   */
  async searchIssues(query: string): Promise<{
    totalCount: number;
    incompleteResults: boolean;
    items: GitHubIssue[];
  }> {
    const data = await this.request<GitHubSearchResponse>("/search/issues", {
      params: { q: query },
    });

    const validated = GitHubSearchResponseSchema.parse(data);

    return {
      totalCount: validated.total_count,
      incompleteResults: validated.incomplete_results,
      items: validated.items.map((item) => GitHubIssueSchema.parse(item)),
    };
  }

  // ==================== Health Check ====================

  /**
   * Check API connectivity
   */
  async health(): Promise<{ ok: boolean; latencyMs: number; user?: { login: string; id: number } }> {
    const start = Date.now();
    try {
      const user = await this.request<{ login: string; id: number }>("/user");
      return { ok: true, latencyMs: Date.now() - start, user };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * GitHub API Error
 */
export class GitHubApiError extends Error {
  status: number;
  documentationUrl: string;

  constructor(message: string, status: number, documentationUrl: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.documentationUrl = documentationUrl;
  }
}

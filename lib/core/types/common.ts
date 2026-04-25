/**
 * Core Types — Common shared utilities
 *
 * Re-exports common types used across the codebase.
 */

export interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export type ProviderId = string;

export type Timestamp = number;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface TenantScope {
  tenantId: string;
  workspaceId: string;
  userId: string;
}

/**
 * Multi-tenant scope types.
 *
 * Every runtime entity (run, mission, asset, connector call) MUST carry
 * a TenantScope. Unscoped entities are forbidden in v2.
 */

export interface TenantScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface ScopedMetadata {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export function isScopedMetadata(
  value: unknown,
): value is ScopedMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.tenantId === "string" && typeof v.workspaceId === "string";
}

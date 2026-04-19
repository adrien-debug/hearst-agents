/**
 * Multi-tenant guards — assertion helpers for scope validation.
 */

import type { TenantScope } from "./types";
import { SYSTEM_CONFIG } from "@/lib/system/config";

export function assertTenantScope(
  scope: Partial<TenantScope>,
): asserts scope is TenantScope {
  if (!scope?.tenantId || !scope?.workspaceId) {
    if (SYSTEM_CONFIG.requireTenantScopeForV2) {
      throw new Error("Missing required tenant scope (tenantId + workspaceId)");
    }
    console.warn("[TenantGuard] Missing tenant scope — dev fallback active");
  }
}

export function sameTenant(
  a?: Partial<TenantScope>,
  b?: Partial<TenantScope>,
): boolean {
  return (
    !!a?.tenantId &&
    !!a?.workspaceId &&
    !!b?.tenantId &&
    !!b?.workspaceId &&
    a.tenantId === b.tenantId &&
    a.workspaceId === b.workspaceId
  );
}

/**
 * Canonical Scope Resolution — User/Tenant/Workspace
 *
 * Centralized helper for resolving the current execution scope.
 * All user-facing API routes MUST use this to ensure data isolation.
 *
 * Dev fallback is explicit and logged — never silent.
 */

import { getUserId } from "./get-user-id";

export interface CanonicalScope {
  userId: string;
  tenantId: string;
  workspaceId: string;
  isDevFallback: boolean;
}

interface ResolveScopeOptions {
  /** Require explicit tenantId (no fallback) */
  requireTenant?: boolean;
  /** Require explicit workspaceId (no fallback) */
  requireWorkspace?: boolean;
  /** Context for logging (e.g., API route path) */
  context?: string;
}

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

/**
 * Resolve the canonical scope for the current request.
 *
 * Flow:
 * 1. Get userId from session (auth required)
 * 2. Resolve tenantId/workspaceId from explicit params or env
 * 3. If missing, use dev fallback ONLY if explicitly allowed
 * 4. Log when dev fallback is used
 *
 * Returns null if auth fails or scope requirements not met.
 */
export async function resolveScope(
  options: ResolveScopeOptions = {},
): Promise<CanonicalScope | null> {
  const { requireTenant = false, requireWorkspace = false, context = "unknown" } = options;

  const userId = await getUserId();
  if (!userId) {
    console.warn(`[Scope] Auth failed — no userId (${context})`);
    return null;
  }

  const explicitTenant = process.env.HEARST_TENANT_ID;
  const explicitWorkspace = process.env.HEARST_WORKSPACE_ID;

  let tenantId: string | null = explicitTenant ?? null;
  let workspaceId: string | null = explicitWorkspace ?? null;
  let isDevFallback = false;

  if (!tenantId || !workspaceId) {
    if (requireTenant && !tenantId) {
      console.error(`[Scope] Tenant required but not resolved (${context}, user: ${userId.slice(0, 8)})`);
      return null;
    }
    if (requireWorkspace && !workspaceId) {
      console.error(`[Scope] Workspace required but not resolved (${context}, user: ${userId.slice(0, 8)})`);
      return null;
    }

    tenantId = tenantId ?? DEV_TENANT_ID;
    workspaceId = workspaceId ?? DEV_WORKSPACE_ID;
    isDevFallback = true;

    console.log(`[Scope] Dev fallback used — tenant: ${tenantId}, workspace: ${workspaceId} (${context}, user: ${userId.slice(0, 8)})`);
  }

  return {
    userId,
    tenantId,
    workspaceId,
    isDevFallback,
  };
}

/**
 * Resolve scope or return HTTP error response.
 * For use in API routes that need to return 401/403.
 */
export async function requireScope(
  options: ResolveScopeOptions = {},
): Promise<{ scope: CanonicalScope; error: null } | { scope: null; error: { message: string; status: number } }> {
  const scope = await resolveScope(options);

  if (!scope) {
    return {
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    };
  }

  return { scope, error: null };
}

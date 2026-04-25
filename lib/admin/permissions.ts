/**
 * Admin Permissions API — Architecture Finale
 *
 * RBAC (Role-Based Access Control) logic.
 * Path: lib/admin/permissions.ts
 *
 * Role hierarchy (highest to lowest):
 * - admin: Full access
 * - editor: Can create/modify, limited delete
 * - viewer: Read-only access
 * - guest: Minimal access, no sensitive data
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "admin" | "editor" | "viewer" | "guest";

export interface PermissionCheck {
  userId: string;
  resource: string;
  action: "create" | "read" | "update" | "delete" | "admin";
  tenantId?: string;
  resourceOwnerId?: string;
}

export interface UserRoleAssignment {
  userId: string;
  role: Role;
  tenantId?: string;
  assignedAt: string;
  assignedBy?: string;
}

// Role hierarchy for permission inheritance
const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 100,
  editor: 75,
  viewer: 50,
  guest: 25,
};

// Permission matrix: role -> resource -> actions
const PERMISSION_MATRIX: Record<Role, Record<string, string[]>> = {
  admin: {
    "*": ["create", "read", "update", "delete", "admin"],
  },
  editor: {
    settings: ["read", "update"],
    connectors: ["read", "create", "update"],
    runs: ["read", "create", "update"],
    assets: ["read", "create", "update"],
    users: ["read"],
    "*": ["read"],
  },
  viewer: {
    settings: ["read"],
    connectors: ["read"],
    runs: ["read"],
    assets: ["read"],
    users: ["read"],
    "*": ["read"],
  },
  guest: {
    runs: ["read"],
    assets: ["read"],
  },
};

/**
 * Check if a user has permission for an action on a resource
 */
export async function checkPermission(
  db: SupabaseClient,
  check: PermissionCheck
): Promise<boolean> {
  const role = await getUserRole(db, check.userId, check.tenantId);
  return hasPermission(role, check.resource, check.action);
}

/**
 * Check permission synchronously (when role is already known)
 */
export function hasPermission(
  role: Role,
  resource: string,
  action: PermissionCheck["action"]
): boolean {
  // Admin has all permissions
  if (role === "admin") return true;

  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return false;

  // Check specific resource permissions
  const specificPerms = rolePerms[resource];
  if (specificPerms?.includes(action) || specificPerms?.includes("*")) {
    return true;
  }

  // Check wildcard permissions
  const wildcardPerms = rolePerms["*"];
  if (wildcardPerms?.includes(action) || wildcardPerms?.includes("*")) {
    return true;
  }

  return false;
}

/**
 * Get user's role (from JWT or database)
 */
export async function getUserRole(
  db: SupabaseClient,
  userId: string,
  tenantId?: string
): Promise<Role> {
  // First check tenant-specific role assignment
  if (tenantId) {
    const { data, error } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (!error && data) {
      return data.role as Role;
    }
  }

  // Fall back to global role from user metadata
  const { data: user, error } = await db
    .auth
    .admin
    .getUserById(userId);

  if (error || !user) {
    console.warn("[Admin/Permissions] Could not fetch user, defaulting to guest:", error);
    return "guest";
  }

  const role = user.user?.user_metadata?.role as Role;
  return role || "guest";
}

/**
 * Assign a role to a user
 */
export async function assignRole(
  db: SupabaseClient,
  userId: string,
  role: Role,
  tenantId?: string,
  assignedBy?: string
): Promise<void> {
  if (tenantId) {
    // Tenant-specific role assignment
    const { error } = await db
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          role,
          assigned_by: assignedBy,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: "user_id,tenant_id" }
      );

    if (error) {
      console.error("[Admin/Permissions] Failed to assign tenant role:", error);
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  } else {
    // Global role - update user metadata
    const { error } = await db.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });

    if (error) {
      console.error("[Admin/Permissions] Failed to assign global role:", error);
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  }
}

/**
 * Remove a role assignment
 */
export async function removeRole(
  db: SupabaseClient,
  userId: string,
  tenantId?: string
): Promise<void> {
  if (tenantId) {
    const { error } = await db
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Admin/Permissions] Failed to remove tenant role:", error);
      throw new Error(`Failed to remove role: ${error.message}`);
    }
  } else {
    // Remove global role from metadata
    const { error } = await db.auth.admin.updateUserById(userId, {
      user_metadata: { role: null },
    });

    if (error) {
      console.error("[Admin/Permissions] Failed to remove global role:", error);
      throw new Error(`Failed to remove role: ${error.message}`);
    }
  }
}

/**
 * Check if role A has higher or equal privilege than role B
 */
export function hasHigherOrEqualRole(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Record<string, string[]> {
  return PERMISSION_MATRIX[role] || {};
}

/**
 * List users with a specific role (tenant-scoped or global)
 */
export async function listUsersWithRole(
  db: SupabaseClient,
  role: Role,
  tenantId?: string
): Promise<string[]> {
  if (tenantId) {
    const { data, error } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", role)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Admin/Permissions] Failed to list users with role:", error);
      throw new Error(`Failed to list users: ${error.message}`);
    }

    return (data || []).map((r) => r.user_id);
  }

  // For global roles, we'd need to query auth users with specific metadata
  // This is expensive and should be cached or paginated
  console.warn("[Admin/Permissions] Listing global users by role not optimized");
  return [];
}

/**
 * Require permission or throw
 */
export async function requirePermission(
  db: SupabaseClient,
  check: PermissionCheck
): Promise<void> {
  const hasPerm = await checkPermission(db, check);
  if (!hasPerm) {
    throw new PermissionDeniedError(
      `User ${check.userId} lacks ${check.action} permission on ${check.resource}`
    );
  }
}

/**
 * Custom error for permission denial
 */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

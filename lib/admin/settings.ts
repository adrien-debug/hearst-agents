/**
 * Admin Settings API — Architecture Finale
 *
 * CRUD system_settings table.
 * Path: lib/admin/settings.ts
 * Status: Stub — Implementation pending
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  scope: "global" | "tenant" | "user";
  tenantId?: string;
  userId?: string;
  updatedAt: string;
}

export async function getSystemSettings(
  db: SupabaseClient,
  scope?: SystemSetting["scope"]
): Promise<SystemSetting[]> {
  // TODO: Implement settings fetch
  console.log("[Admin/Settings] getSystemSettings scope=", scope);
  return [];
}

export async function updateSystemSetting(
  db: SupabaseClient,
  key: string,
  value: unknown,
  scope: SystemSetting["scope"] = "global"
): Promise<void> {
  // TODO: Implement setting update
  console.log("[Admin/Settings] updateSystemSetting key=", key, "value=", value);
}

export async function deleteSystemSetting(
  db: SupabaseClient,
  key: string
): Promise<void> {
  // TODO: Implement setting deletion
  console.log("[Admin/Settings] deleteSystemSetting key=", key);
}

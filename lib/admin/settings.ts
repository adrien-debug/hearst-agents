/**
 * Admin Settings API — Architecture Finale
 *
 * CRUD system_settings table with tenant override support.
 * Path: lib/admin/settings.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SettingCategory =
  | "feature_flags"
  | "thresholds"
  | "limits"
  | "integrations"
  | "ui"
  | "analytics";

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  category: SettingCategory;
  description?: string;
  isEncrypted: boolean;
  tenantId: string | null;
  updatedAt: string;
  updatedBy?: string;
}

export interface CreateSettingInput {
  key: string;
  value: unknown;
  category: SettingCategory;
  description?: string;
  isEncrypted?: boolean;
  tenantId?: string | null;
  updatedBy?: string;
}

export interface UpdateSettingInput {
  value?: unknown;
  category?: SettingCategory;
  description?: string;
  isEncrypted?: boolean;
  updatedBy?: string;
}

/**
 * Get system settings with optional filtering
 */
export async function getSystemSettings(
  db: SupabaseClient,
  filters?: {
    category?: SettingCategory;
    tenantId?: string | null;
    includeGlobal?: boolean;
  }
): Promise<SystemSetting[]> {
  let query = db
    .from("system_settings")
    .select("*")
    .order("key");

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  if (filters?.tenantId === null) {
    query = query.is("tenant_id", null);
  } else if (filters?.tenantId) {
    if (filters.includeGlobal) {
      query = query.or(`tenant_id.eq.${filters.tenantId},tenant_id.is.null`);
    } else {
      query = query.eq("tenant_id", filters.tenantId);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Admin/Settings] Failed to fetch settings:", error);
    throw new Error(`Failed to fetch settings: ${error.message}`);
  }

  return (data || []).map(parseSettingRow);
}

/**
 * Get a single setting by key
 */
export async function getSystemSetting(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null
): Promise<SystemSetting | null> {
  let query = db
    .from("system_settings")
    .select("*")
    .eq("key", key);

  if (tenantId === null || tenantId === undefined) {
    query = query.is("tenant_id", null);
  } else {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("[Admin/Settings] Failed to fetch setting:", error);
    throw new Error(`Failed to fetch setting: ${error.message}`);
  }

  return data ? parseSettingRow(data) : null;
}

/**
 * Get effective setting (tenant override or global fallback)
 */
export async function getEffectiveSetting<T = unknown>(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null,
  defaultValue?: T
): Promise<T> {
  // Try tenant-specific first
  if (tenantId) {
    const tenantSetting = await getSystemSetting(db, key, tenantId);
    if (tenantSetting) return tenantSetting.value as T;
  }

  // Fall back to global
  const globalSetting = await getSystemSetting(db, key, null);
  if (globalSetting) return globalSetting.value as T;

  return defaultValue as T;
}

/**
 * Create a new setting
 */
export async function createSystemSetting(
  db: SupabaseClient,
  input: CreateSettingInput
): Promise<SystemSetting> {
  const { data, error } = await db
    .from("system_settings")
    .insert({
      key: input.key,
      value: JSON.stringify(input.value),
      category: input.category,
      description: input.description,
      is_encrypted: input.isEncrypted ?? false,
      tenant_id: input.tenantId ?? null,
      updated_by: input.updatedBy,
    })
    .select()
    .single();

  if (error) {
    console.error("[Admin/Settings] Failed to create setting:", error);
    throw new Error(`Failed to create setting: ${error.message}`);
  }

  return parseSettingRow(data);
}

/**
 * Update an existing setting
 */
export async function updateSystemSetting(
  db: SupabaseClient,
  key: string,
  input: UpdateSettingInput,
  tenantId?: string | null
): Promise<SystemSetting> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.value !== undefined) {
    updates.value = JSON.stringify(input.value);
  }
  if (input.category !== undefined) {
    updates.category = input.category;
  }
  if (input.description !== undefined) {
    updates.description = input.description;
  }
  if (input.isEncrypted !== undefined) {
    updates.is_encrypted = input.isEncrypted;
  }
  if (input.updatedBy !== undefined) {
    updates.updated_by = input.updatedBy;
  }

  let query = db
    .from("system_settings")
    .update(updates)
    .eq("key", key);

  if (tenantId === null || tenantId === undefined) {
    query = query.is("tenant_id", null);
  } else {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select().single();

  if (error) {
    console.error("[Admin/Settings] Failed to update setting:", error);
    throw new Error(`Failed to update setting: ${error.message}`);
  }

  return parseSettingRow(data);
}

/**
 * Upsert a setting (create if not exists, update otherwise)
 */
export async function upsertSystemSetting(
  db: SupabaseClient,
  input: CreateSettingInput
): Promise<SystemSetting> {
  const existing = await getSystemSetting(db, input.key, input.tenantId ?? null);

  if (existing) {
    return updateSystemSetting(
      db,
      input.key,
      {
        value: input.value,
        category: input.category,
        description: input.description,
        isEncrypted: input.isEncrypted,
        updatedBy: input.updatedBy,
      },
      input.tenantId ?? null
    );
  }

  return createSystemSetting(db, input);
}

/**
 * Delete a setting
 */
export async function deleteSystemSetting(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null
): Promise<void> {
  let query = db
    .from("system_settings")
    .delete()
    .eq("key", key);

  if (tenantId === null || tenantId === undefined) {
    query = query.is("tenant_id", null);
  } else {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query;

  if (error) {
    console.error("[Admin/Settings] Failed to delete setting:", error);
    throw new Error(`Failed to delete setting: ${error.message}`);
  }
}

/**
 * Parse a database row into SystemSetting interface
 */
function parseSettingRow(row: Record<string, unknown>): SystemSetting {
  return {
    id: row.id as string,
    key: row.key as string,
    value: parseValue(row.value as string, row.is_encrypted as boolean),
    category: row.category as SettingCategory,
    description: row.description as string | undefined,
    isEncrypted: row.is_encrypted as boolean,
    tenantId: row.tenant_id as string | null,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | undefined,
  };
}

/**
 * Parse value from stored string (handle JSON and encryption)
 */
function parseValue(valueStr: string, isEncrypted: boolean): unknown {
  if (isEncrypted) {
    // TODO: Decrypt if encryption is implemented
    return valueStr;
  }

  try {
    return JSON.parse(valueStr);
  } catch {
    return valueStr;
  }
}

/**
 * Get feature flags (convenience function)
 */
export async function getFeatureFlags(
  db: SupabaseClient,
  tenantId?: string | null
): Promise<Record<string, boolean>> {
  const settings = await getSystemSettings(db, {
    category: "feature_flags",
    tenantId: tenantId ?? null,
    includeGlobal: !!tenantId,
  });

  const flags: Record<string, boolean> = {};
  for (const setting of settings) {
    flags[setting.key] = setting.value === true || setting.value === "true";
  }
  return flags;
}

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(
  db: SupabaseClient,
  featureKey: string,
  tenantId?: string | null,
  defaultValue = false
): Promise<boolean> {
  const value = await getEffectiveSetting<unknown>(db, featureKey, tenantId, defaultValue);
  return value === true || (typeof value === "string" && value.toLowerCase() === "true");
}

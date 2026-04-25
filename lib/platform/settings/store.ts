/**
 * Platform Settings — Store
 *
 * Database operations for system_settings table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemSetting, SettingValue, SettingCategory } from "./types";

const TABLE = "system_settings";

/**
 * Get a setting with tenant-specific priority.
 * Returns tenant setting if exists, otherwise global (tenant_id = null).
 */
export async function getSetting(
  db: SupabaseClient,
  key: string,
  tenantId: string | null = null
): Promise<SystemSetting | null> {
  // First, try to get tenant-specific setting
  if (tenantId) {
    const { data: tenantData, error: tenantError } = await db
      .from(TABLE)
      .select("*")
      .eq("key", key)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (tenantError) {
      console.error(`[Settings] Error fetching tenant setting ${key}:`, tenantError.message);
    } else if (tenantData) {
      return transformFromDb(tenantData);
    }
  }

  // Fallback to global setting (tenant_id = null)
  const { data: globalData, error: globalError } = await db
    .from(TABLE)
    .select("*")
    .eq("key", key)
    .is("tenant_id", null)
    .maybeSingle();

  if (globalError) {
    console.error(`[Settings] Error fetching global setting ${key}:`, globalError.message);
    return null;
  }

  if (!globalData) {
    return null;
  }

  return transformFromDb(globalData);
}

export async function setSetting(
  db: SupabaseClient,
  key: string,
  value: SettingValue,
  category: SettingCategory,
  tenantId: string | null = null,
  options?: {
    description?: string;
    isEncrypted?: boolean;
    updatedBy?: string;
  }
): Promise<SystemSetting> {
  const row = {
    key,
    value: JSON.stringify(value),
    category,
    tenant_id: tenantId,
    description: options?.description,
    is_encrypted: options?.isEncrypted ?? false,
    updated_at: new Date().toISOString(),
    updated_by: options?.updatedBy,
  };

  const { data, error } = await db
    .from(TABLE)
    .upsert(row, { onConflict: "key,tenant_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`[Settings] Failed to set ${key}: ${error.message}`);
  }

  return transformFromDb(data);
}

export async function getAllSettings(
  db: SupabaseClient,
  category?: SettingCategory,
  tenantId?: string | null
): Promise<SystemSetting[]> {
  let query = db.from(TABLE).select("*");

  if (category) {
    query = query.eq("category", category);
  }

  if (tenantId !== undefined) {
    if (tenantId === null) {
      query = query.is("tenant_id", null);
    } else {
      query = query.eq("tenant_id", tenantId);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[Settings] Error fetching settings:`, error.message);
    return [];
  }

  if (!data) {
    return [];
  }

  return data.map(transformFromDb);
}

function transformFromDb(row: Record<string, unknown>): SystemSetting {
  return {
    id: row.id as string,
    key: row.key as string,
    value: parseValue(row.value as string),
    category: row.category as SettingCategory,
    description: row.description as string | undefined,
    isEncrypted: row.is_encrypted as boolean,
    tenantId: row.tenant_id as string | null,
    updatedAt: new Date(row.updated_at as string).getTime(),
    updatedBy: row.updated_by as string | undefined,
  };
}

function parseValue(valueStr: string): SettingValue {
  try {
    return JSON.parse(valueStr);
  } catch {
    return valueStr;
  }
}

/**
 * Admin Settings API — Architecture Finale
 *
 * Thin façade over platform/settings/store for admin CRUD.
 * Single source of truth for types: lib/platform/settings/types.ts
 * Path: lib/admin/settings.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSetting,
  setSetting,
  getAllSettings,
} from "@/lib/platform/settings/store";

export type {
  SettingCategory,
  SettingValue,
  SystemSetting,
} from "@/lib/platform/settings/types";

import type {
  SettingCategory,
  SystemSetting,
} from "@/lib/platform/settings/types";

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
  const results = await getAllSettings(db, filters?.category, filters?.tenantId);

  if (filters?.tenantId && filters.includeGlobal) {
    const globalResults = await getAllSettings(db, filters.category, null);
    const tenantKeys = new Set(results.map((r) => r.key));
    for (const g of globalResults) {
      if (!tenantKeys.has(g.key)) {
        results.push(g);
      }
    }
  }

  return results;
}

/**
 * Get a single setting by key
 */
export async function getSystemSetting(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null
): Promise<SystemSetting | null> {
  return getSetting(db, key, tenantId ?? null);
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
  if (tenantId) {
    const tenantSetting = await getSetting(db, key, tenantId);
    if (tenantSetting) return tenantSetting.value as T;
  }

  const globalSetting = await getSetting(db, key, null);
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
  return setSetting(db, input.key, input.value as string | number | boolean | object, input.category, input.tenantId ?? null, {
    description: input.description,
    isEncrypted: input.isEncrypted,
    updatedBy: input.updatedBy,
  });
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
  const existing = await getSetting(db, key, tenantId ?? null);
  if (!existing) {
    throw new Error(`Setting '${key}' not found`);
  }

  return setSetting(
    db,
    key,
    (input.value ?? existing.value) as string | number | boolean | object,
    input.category ?? existing.category,
    tenantId ?? null,
    {
      description: input.description ?? existing.description,
      isEncrypted: input.isEncrypted ?? existing.isEncrypted,
      updatedBy: input.updatedBy,
    }
  );
}

/**
 * Upsert a setting (create if not exists, update otherwise)
 */
export async function upsertSystemSetting(
  db: SupabaseClient,
  input: CreateSettingInput
): Promise<SystemSetting> {
  return setSetting(db, input.key, input.value as string | number | boolean | object, input.category, input.tenantId ?? null, {
    description: input.description,
    isEncrypted: input.isEncrypted,
    updatedBy: input.updatedBy,
  });
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
    console.error("[Admin/Settings] Failed to delete setting:", error.message);
    throw new Error(`Failed to delete setting: ${error.message}`);
  }
}

/**
 * Get feature flags (convenience)
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

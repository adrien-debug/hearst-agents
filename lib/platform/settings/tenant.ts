/**
 * Platform Settings — Tenant-scoped Settings
 *
 * Per-tenant overrides of global system settings.
 * Allows each tenant to customize feature flags, limits, and integrations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemSetting, SettingValue, SettingCategory } from "./types";
import { getSetting, setSetting, getAllSettings } from "./store";

export async function getTenantSetting<T extends SettingValue>(
  db: SupabaseClient,
  tenantId: string,
  key: string,
  defaultValue: T,
): Promise<T> {
  const setting = await getSetting(db, key, tenantId);
  return (setting?.value as T) ?? defaultValue;
}

export async function setTenantSetting(
  db: SupabaseClient,
  tenantId: string,
  key: string,
  value: SettingValue,
  category: SettingCategory,
  updatedBy?: string,
): Promise<SystemSetting> {
  return setSetting(db, key, value, category, tenantId, {
    description: `Tenant override for ${key}`,
    updatedBy,
  });
}

export async function getAllTenantSettings(
  db: SupabaseClient,
  tenantId: string,
  category?: SettingCategory,
): Promise<SystemSetting[]> {
  return getAllSettings(db, category, tenantId);
}

export async function getTenantFeatureFlag(
  db: SupabaseClient,
  tenantId: string,
  key: string,
): Promise<boolean> {
  return getTenantSetting<boolean>(db, tenantId, key, false);
}

export async function setTenantFeatureFlag(
  db: SupabaseClient,
  tenantId: string,
  key: string,
  enabled: boolean,
  updatedBy?: string,
): Promise<void> {
  await setTenantSetting(db, tenantId, key, enabled, "feature_flags", updatedBy);
}

export async function getTenantLimit(
  db: SupabaseClient,
  tenantId: string,
  key: string,
  defaultValue: number,
): Promise<number> {
  return getTenantSetting<number>(db, tenantId, key, defaultValue);
}

/**
 * Reset all tenant overrides (revert to global defaults).
 */
export async function resetTenantSettings(
  db: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const tenantSettings = await getAllTenantSettings(db, tenantId);
  let deleted = 0;
  for (const setting of tenantSettings) {
    const { error } = await db
      .from("system_settings")
      .delete()
      .eq("id", setting.id);
    if (!error) deleted++;
  }
  return deleted;
}

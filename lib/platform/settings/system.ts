/**
 * Platform Settings — System (Feature flags, global config)
 *
 * Manages global system-level settings: feature flags, thresholds, limits.
 * These settings apply to the entire platform unless overridden by tenant.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingValue } from "./types";
import { getSettingValue, setSettingValue } from "./index";
import { getDefaultDefinition, DEFAULT_SETTINGS } from "./defaults";

export async function getFeatureFlag(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null,
): Promise<boolean> {
  const def = getDefaultDefinition(key);
  const defaultVal = (def?.defaultValue as boolean) ?? false;
  return getSettingValue<boolean>(db, key, defaultVal, tenantId);
}

export async function setFeatureFlag(
  db: SupabaseClient,
  key: string,
  enabled: boolean,
  updatedBy?: string,
): Promise<void> {
  const def = getDefaultDefinition(key) ?? {
    key,
    category: "feature_flags" as const,
    defaultValue: false,
    description: `Feature flag: ${key}`,
  };
  await setSettingValue(db, def, enabled, null, updatedBy);
}

export async function getThreshold(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null,
): Promise<number> {
  const def = getDefaultDefinition(key);
  const defaultVal = (def?.defaultValue as number) ?? 0;
  return getSettingValue<number>(db, key, defaultVal, tenantId);
}

export async function setThreshold(
  db: SupabaseClient,
  key: string,
  value: number,
  updatedBy?: string,
): Promise<void> {
  const def = getDefaultDefinition(key) ?? {
    key,
    category: "thresholds" as const,
    defaultValue: 0,
    description: `Threshold: ${key}`,
  };
  await setSettingValue(db, def, value, null, updatedBy);
}

export async function getLimit(
  db: SupabaseClient,
  key: string,
  tenantId?: string | null,
): Promise<number> {
  const def = getDefaultDefinition(key);
  const defaultVal = (def?.defaultValue as number) ?? 0;
  return getSettingValue<number>(db, key, defaultVal, tenantId);
}

/**
 * Seed all default settings into the database (idempotent).
 */
export async function seedDefaults(
  db: SupabaseClient,
  updatedBy?: string,
): Promise<number> {
  let seeded = 0;
  for (const def of DEFAULT_SETTINGS) {
    const existing = await getSettingValue<SettingValue>(db, def.key, undefined as unknown as SettingValue);
    if (existing === undefined || existing === null) {
      await setSettingValue(db, def, def.defaultValue, null, updatedBy);
      seeded++;
    }
  }
  return seeded;
}

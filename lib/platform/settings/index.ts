/**
 * Platform Settings — Public API
 *
 * Cached access to system settings with fallbacks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemSetting, SettingValue, SettingDefinition } from "./types";
import { getSetting, setSetting, getAllSettings } from "./store";

// In-memory cache with 60s TTL
const cache = new Map<string, { value: SettingValue; expiresAt: number }>();
const CACHE_TTL_MS = 60000;

/**
 * Get a setting value with caching.
 * Returns default if not found in DB.
 */
export async function getSettingValue<T extends SettingValue>(
  db: SupabaseClient,
  key: string,
  defaultValue: T,
  tenantId?: string | null
): Promise<T> {
  // Check cache
  const cacheKey = tenantId ? `${key}:${tenantId}` : key;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  // Fetch from DB
  const setting = await getSetting(db, key, tenantId);
  const value = setting?.value ?? defaultValue;

  // Update cache
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });

  return value as T;
}

/**
 * Set a setting value and invalidate cache.
 */
export async function setSettingValue(
  db: SupabaseClient,
  definition: SettingDefinition,
  value: SettingValue,
  tenantId?: string | null,
  updatedBy?: string
): Promise<SystemSetting> {
  const result = await setSetting(db, definition.key, value, definition.category, tenantId, {
    description: definition.description,
    isEncrypted: definition.isSensitive,
    updatedBy,
  });

  // Invalidate cache
  const cacheKey = tenantId ? `${definition.key}:${tenantId}` : definition.key;
  cache.delete(cacheKey);

  return result;
}

/**
 * Get all settings for a category.
 */
export async function getCategorySettings(
  db: SupabaseClient,
  category: SystemSetting["category"],
  tenantId?: string | null
): Promise<Record<string, SettingValue>> {
  const settings = await getAllSettings(db, category, tenantId);
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

/**
 * Invalidate all cached settings.
 */
export function invalidateSettingsCache(): void {
  cache.clear();
}

// Re-exports
export { getSetting, setSetting, getAllSettings } from "./store";
export type { SystemSetting, SettingValue, SettingCategory, SettingDefinition } from "./types";

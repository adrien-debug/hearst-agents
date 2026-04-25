/**
 * Platform Settings — Types
 *
 * Dynamic system configuration stored in Supabase.
 * Supports feature flags, thresholds, and tenant overrides.
 */

export type SettingCategory =
  | "feature_flags"
  | "thresholds"
  | "limits"
  | "integrations"
  | "ui"
  | "analytics";

export type SettingValue = string | number | boolean | object;

export interface SystemSetting {
  id: string;
  key: string;
  value: SettingValue;
  category: SettingCategory;
  description?: string;
  isEncrypted: boolean;
  tenantId: string | null; // null = global default
  updatedAt: number;
  updatedBy?: string;
}

export interface SettingCache {
  data: Record<string, SystemSetting>;
  loadedAt: number;
  ttlMs: number;
}

export interface SettingDefinition {
  key: string;
  category: SettingCategory;
  defaultValue: SettingValue;
  description: string;
  schema?: "string" | "number" | "boolean" | "json";
  isSensitive?: boolean;
}

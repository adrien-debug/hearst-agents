/**
 * Platform Settings — Default Definitions
 *
 * Source of truth for system defaults.
 * These are seeded on first boot.
 */

import type { SettingDefinition } from "./types";

export const DEFAULT_SETTINGS: SettingDefinition[] = [
  // Feature Flags
  {
    key: "analytics.enabled",
    category: "feature_flags",
    defaultValue: true,
    description: "Enable analytics event tracking",
    schema: "boolean",
  },
  {
    key: "toasts.enabled",
    category: "feature_flags",
    defaultValue: true,
    description: "Enable user toast notifications",
    schema: "boolean",
  },

  // Thresholds
  {
    key: "memory.max_tokens",
    category: "thresholds",
    defaultValue: 128000,
    description: "Maximum context window tokens",
    schema: "number",
  },
  {
    key: "runs.max_concurrent",
    category: "thresholds",
    defaultValue: 5,
    description: "Maximum concurrent runs per user",
    schema: "number",
  },

  // Limits
  {
    key: "upload.max_size_mb",
    category: "limits",
    defaultValue: 50,
    description: "Maximum file upload size in MB",
    schema: "number",
  },

  // Integrations
  {
    key: "nango.enabled",
    category: "integrations",
    defaultValue: true,
    description: "Enable Nango OAuth integration",
    schema: "boolean",
  },

  // UI
  {
    key: "ui.theme.default",
    category: "ui",
    defaultValue: "dark",
    description: "Default UI theme",
    schema: "string",
  },

  // Analytics
  {
    key: "analytics.retention_days",
    category: "analytics",
    defaultValue: 90,
    description: "Event retention period",
    schema: "number",
  },
];

/**
 * Get default definition for a key.
 */
export function getDefaultDefinition(key: string): SettingDefinition | undefined {
  return DEFAULT_SETTINGS.find((s) => s.key === key);
}

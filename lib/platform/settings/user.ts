/**
 * Platform Settings — User Preferences
 *
 * Per-user settings: UI theme, notification preferences, language, etc.
 * Stored in system_settings with a composite key "user:{userId}:{key}".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingValue, SettingCategory } from "./types";
import { getSetting, setSetting } from "./store";

function userKey(userId: string, key: string): string {
  return `user:${userId}:${key}`;
}

export async function getUserPreference<T extends SettingValue>(
  db: SupabaseClient,
  userId: string,
  key: string,
  defaultValue: T,
): Promise<T> {
  const setting = await getSetting(db, userKey(userId, key));
  return (setting?.value as T) ?? defaultValue;
}

export async function setUserPreference(
  db: SupabaseClient,
  userId: string,
  key: string,
  value: SettingValue,
  category: SettingCategory = "ui",
): Promise<void> {
  await setSetting(db, userKey(userId, key), value, category, null, {
    description: `User preference: ${key}`,
    updatedBy: userId,
  });
}

export async function getUserTheme(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  return getUserPreference(db, userId, "theme", "dark");
}

export async function setUserTheme(
  db: SupabaseClient,
  userId: string,
  theme: string,
): Promise<void> {
  await setUserPreference(db, userId, "theme", theme);
}

export async function getUserLocale(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  return getUserPreference(db, userId, "locale", "fr");
}

export async function getUserNotificationPrefs(
  db: SupabaseClient,
  userId: string,
): Promise<{ email: boolean; push: boolean; slack: boolean }> {
  return getUserPreference(db, userId, "notifications", {
    email: true,
    push: true,
    slack: false,
  });
}

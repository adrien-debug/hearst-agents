/**
 * Schéma Zod pour les préférences d'alerting tenant.
 *
 * Stocké dans `system_settings` (clé `alerting.preferences`, category
 * `integrations`, scope tenant_id) en JSON. Lu par `loadAlertingPreferences()`
 * via la couche `lib/platform/settings`.
 *
 * Forme :
 *   {
 *     webhooks: [{ url, signalTypes[] }],
 *     email:    { recipients[], signalTypes[] }?,
 *     slack:    { webhookUrl, signalTypes[] }?
 *   }
 *
 * - `signalTypes[]` filtre les signaux émis par l'extracteur déterministe.
 *   Liste vide = aucun signal n'active ce canal (équivalent à désactiver).
 *   Mettre `["*"]` pour matcher tous les signaux.
 */

import { z } from "zod";
import { BUSINESS_SIGNAL_TYPES } from "@/lib/reports/signals/types";

/** Liste de signaux : chaque entrée est un BusinessSignalType ou "*" (wildcard). */
const signalFilterSchema = z
  .array(
    z.union([
      z.enum(BUSINESS_SIGNAL_TYPES),
      z.literal("*"),
    ]),
  )
  .max(BUSINESS_SIGNAL_TYPES.length + 1);

const webhookChannelSchema = z.object({
  url: z.string().url(),
  signalTypes: signalFilterSchema,
});

const emailChannelSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(20),
  signalTypes: signalFilterSchema,
});

const slackChannelSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine(
      (u) =>
        u.startsWith("https://hooks.slack.com/") ||
        // Permet une URL Slack-compat custom (proxy interne, etc.).
        u.startsWith("https://"),
      "slack.webhookUrl doit être une URL HTTPS",
    ),
  signalTypes: signalFilterSchema,
});

export const alertingPreferencesSchema = z.object({
  webhooks: z.array(webhookChannelSchema).max(10).default([]),
  email: emailChannelSchema.optional(),
  slack: slackChannelSchema.optional(),
});

export type AlertingPreferences = z.infer<typeof alertingPreferencesSchema>;
export type WebhookChannelConfig = z.infer<typeof webhookChannelSchema>;
export type EmailChannelConfig = z.infer<typeof emailChannelSchema>;
export type SlackChannelConfig = z.infer<typeof slackChannelSchema>;

/** Clé canonique dans `system_settings` (category=integrations, scope tenant). */
export const ALERTING_PREFERENCES_SETTING_KEY = "alerting.preferences";

export const DEFAULT_ALERTING_PREFERENCES: AlertingPreferences = {
  webhooks: [],
};

/**
 * Helper sûr : parse + retourne defaults si la valeur est invalide ou absente.
 * On choisit de logger silencieusement (warn) plutôt que de throw — un tenant
 * mal configuré ne doit pas casser le pipeline reports.
 */
export function parseAlertingPreferences(
  value: unknown,
): AlertingPreferences {
  if (value == null) return DEFAULT_ALERTING_PREFERENCES;
  const result = alertingPreferencesSchema.safeParse(value);
  if (!result.success) {
    console.warn(
      "[alerting] préférences invalides — fallback defaults :",
      result.error.issues[0]?.message,
    );
    return DEFAULT_ALERTING_PREFERENCES;
  }
  return result.data;
}

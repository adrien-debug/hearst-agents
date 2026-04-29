/**
 * Notifications in-app — CRUD Supabase.
 *
 * Ce module est le seul accès à la table `in_app_notifications`.
 * Appelé par :
 *   - `alert-dispatcher.ts` après dispatch webhook/email/Slack
 *   - Le store front-end (`stores/notifications.ts`) via API routes
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Schémas Zod ────────────────────────────────────────────────────────────

export const NotificationKindSchema = z.enum([
  "signal",
  "report_ready",
  "export_done",
  "share_viewed",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationSeveritySchema = z.enum(["info", "warning", "critical"]);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  kind: NotificationKindSchema,
  severity: NotificationSeveritySchema,
  title: z.string().min(1).max(200),
  body: z.string().max(500).nullable(),
  meta: z.record(z.unknown()).nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// ── Input schemas ──────────────────────────────────────────────────────────

const CreateNotificationInputSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  kind: NotificationKindSchema,
  severity: NotificationSeveritySchema,
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  meta: z.record(z.unknown()).optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationInputSchema>;

const ListNotificationsInputSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  unreadOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListNotificationsInput = z.infer<typeof ListNotificationsInputSchema>;

// ── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Insère une notification en base.
 * Best-effort : ne throw pas (cohérent avec le reste du dispatcher).
 */
export async function createNotification(
  db: SupabaseClient,
  input: CreateNotificationInput,
): Promise<Notification | null> {
  const parsed = CreateNotificationInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn(
      "[in-app] createNotification — input invalide :",
      parsed.error.issues[0]?.message,
    );
    return null;
  }

  const { tenantId, userId, kind, severity, title, body, meta } = parsed.data;

  const { data, error } = await db
    .from("in_app_notifications")
    .insert({
      tenant_id: tenantId,
      user_id: userId ?? null,
      kind,
      severity,
      title,
      body: body ?? null,
      meta: meta ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[in-app] createNotification error :", error.message);
    return null;
  }

  const result = NotificationSchema.safeParse(data);
  if (!result.success) {
    console.warn("[in-app] createNotification — réponse DB invalide");
    return null;
  }
  return result.data;
}

/**
 * Retourne les notifications d'un tenant, triées par date desc.
 * Si userId fourni, retourne celles ciblées à ce user OU sans user spécifique (broadcast).
 */
export async function listNotifications(
  db: SupabaseClient,
  input: ListNotificationsInput,
): Promise<Notification[]> {
  const parsed = ListNotificationsInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("[in-app] listNotifications — input invalide");
    return [];
  }

  const { tenantId, userId, unreadOnly, limit } = parsed.data;

  let query = db
    .from("in_app_notifications")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    // Notifs ciblées à ce user OU broadcast (user_id null)
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[in-app] listNotifications error :", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => NotificationSchema.safeParse(row))
    .filter((r): r is z.SafeParseSuccess<Notification> => r.success)
    .map((r) => r.data);
}

/**
 * Marque une notification comme lue.
 */
export async function markRead(
  db: SupabaseClient,
  { notificationId, tenantId }: { notificationId: string; tenantId: string },
): Promise<void> {
  const { error } = await db
    .from("in_app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("tenant_id", tenantId)
    .is("read_at", null);

  if (error) {
    console.error("[in-app] markRead error :", error.message);
  }
}

/**
 * Marque toutes les notifications non-lues d'un tenant/user comme lues.
 */
export async function markAllRead(
  db: SupabaseClient,
  { tenantId, userId }: { tenantId: string; userId?: string },
): Promise<void> {
  let query = db
    .from("in_app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("read_at", null);

  if (userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  }

  const { error } = await query;

  if (error) {
    console.error("[in-app] markAllRead error :", error.message);
  }
}

/**
 * Formate le titre d'une notification de signal pour affichage.
 * Ex : "[🔴 Critical] MRR drop détecté sur Founder Cockpit"
 */
export function formatSignalTitle(
  severity: NotificationSeverity,
  signalType: string,
  reportTitle: string,
): string {
  const prefix =
    severity === "critical"
      ? "[🔴 Critical]"
      : severity === "warning"
        ? "[🟡 Warning]"
        : "[🔵 Info]";
  const label = signalType.replace(/_/g, " ");
  return `${prefix} ${label} détecté sur ${reportTitle}`;
}

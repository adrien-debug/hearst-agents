/**
 * CRUD webhooks custom en Supabase.
 *
 * Validation Zod :
 * - url : https uniquement (hors NODE_ENV=test où http est toléré pour les tests unitaires)
 * - events : minimum 1 événement dans la liste
 * - name : non vide
 */

import { z } from "zod";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WEBHOOK_EVENTS, type CustomWebhook, type WebhookEvent } from "./types";

// ── Schémas Zod ─────────────────────────────────────────────

const isTest = process.env.NODE_ENV === "test";

const webhookUrlSchema = isTest
  ? z.string().url()
  : z.string().url().refine(
      (u) => u.startsWith("https://"),
      "L'URL du webhook doit utiliser HTTPS",
    );

export const createWebhookSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1, "Le nom est requis"),
  url: webhookUrlSchema,
  secret: z.string().optional(),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Au moins un événement est requis"),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).optional(),
  url: webhookUrlSchema.optional(),
  secret: z.string().nullable().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookPatch = z.infer<typeof updateWebhookSchema>;

// ── Helper DB ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): SupabaseClient<any> | null {
  const sb = getServerSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

function rowToWebhook(row: Record<string, unknown>): CustomWebhook {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    url: row.url as string,
    secret: (row.secret as string | null) ?? undefined,
    events: (row.events as WebhookEvent[]) ?? [],
    active: row.active as boolean,
    createdAt: row.created_at as string,
    lastTriggeredAt: (row.last_triggered_at as string | null) ?? undefined,
    lastStatus: (row.last_status as "success" | "failed" | null) ?? undefined,
  };
}

// ── CRUD ─────────────────────────────────────────────────────

/**
 * Crée un webhook pour un tenant.
 */
export async function createWebhook(
  input: CreateWebhookInput,
): Promise<CustomWebhook> {
  const parsed = createWebhookSchema.parse(input);
  const client = db();
  if (!client) throw new Error("Supabase non disponible");

  const { data, error } = await client
    .from("custom_webhooks")
    .insert({
      tenant_id: parsed.tenantId,
      name: parsed.name,
      url: parsed.url,
      secret: parsed.secret ?? null,
      events: parsed.events,
      active: true,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createWebhook DB error: ${error?.message ?? "no data"}`);
  }

  return rowToWebhook(data as Record<string, unknown>);
}

/**
 * Liste les webhooks d'un tenant (actifs ou non).
 */
export async function listWebhooks({
  tenantId,
  activeOnly = false,
}: {
  tenantId: string;
  activeOnly?: boolean;
}): Promise<CustomWebhook[]> {
  const client = db();
  if (!client) return [];

  let query = client
    .from("custom_webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (activeOnly) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("[WebhookStore] listWebhooks error:", error?.message);
    return [];
  }

  return (data as Record<string, unknown>[]).map(rowToWebhook);
}

/**
 * Charge les webhooks actifs d'un tenant qui souscrivent à un événement donné.
 */
export async function getActiveWebhooksForEvent({
  tenantId,
  event,
}: {
  tenantId: string;
  event: string;
}): Promise<CustomWebhook[]> {
  const client = db();
  if (!client) return [];

  const { data, error } = await client
    .from("custom_webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .contains("events", [event]);

  if (error || !data) {
    console.error("[WebhookStore] getActiveWebhooksForEvent error:", error?.message);
    return [];
  }

  return (data as Record<string, unknown>[]).map(rowToWebhook);
}

/**
 * Met à jour un webhook (patch partiel).
 * Vérifie l'appartenance au tenant pour éviter les escalades de privilège.
 */
export async function updateWebhook({
  id,
  tenantId,
  patch,
}: {
  id: string;
  tenantId: string;
  patch: UpdateWebhookPatch;
}): Promise<CustomWebhook> {
  const parsedPatch = updateWebhookSchema.parse(patch);
  const client = db();
  if (!client) throw new Error("Supabase non disponible");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {};
  if (parsedPatch.name !== undefined) updatePayload.name = parsedPatch.name;
  if (parsedPatch.url !== undefined) updatePayload.url = parsedPatch.url;
  if (parsedPatch.secret !== undefined) updatePayload.secret = parsedPatch.secret;
  if (parsedPatch.events !== undefined) updatePayload.events = parsedPatch.events;
  if (parsedPatch.active !== undefined) updatePayload.active = parsedPatch.active;

  const { data, error } = await client
    .from("custom_webhooks")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`updateWebhook DB error: ${error?.message ?? "no data"}`);
  }

  return rowToWebhook(data as Record<string, unknown>);
}

/**
 * Supprime un webhook. Vérifie l'appartenance au tenant.
 */
export async function deleteWebhook({
  id,
  tenantId,
}: {
  id: string;
  tenantId: string;
}): Promise<void> {
  const client = db();
  if (!client) throw new Error("Supabase non disponible");

  const { error } = await client
    .from("custom_webhooks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`deleteWebhook DB error: ${error.message}`);
  }
}

/**
 * Met à jour le statut après dispatch (fire-and-forget interne).
 */
export async function updateWebhookStatus({
  id,
  status,
  triggeredAt,
}: {
  id: string;
  status: "success" | "failed";
  triggeredAt: string;
}): Promise<void> {
  const client = db();
  if (!client) return;

  await client
    .from("custom_webhooks")
    .update({
      last_triggered_at: triggeredAt,
      last_status: status,
    })
    .eq("id", id);
}

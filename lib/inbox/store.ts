/**
 * Inbox Store — accès au dernier brief persisté pour un user.
 *
 * Source : table `assets` filtrée par `kind: "inbox_brief"` et
 * `provenance.userId === userId`. On retourne le row le plus récent.
 *
 * Le contenu réel du brief est dans `content_ref` (JSON stringifié).
 * Snooze : on persiste `snoozedUntil` directement sur l'item à l'intérieur
 * du JSON. Le snooze remet à jour l'asset (re-store avec items modifiés).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { storeAsset } from "@/lib/assets/types";
import type { InboxBrief, InboxItem } from "./inbox-brief";

interface AssetRow {
  id: string;
  thread_id: string;
  kind: string;
  title: string;
  summary: string | null;
  content_ref: string | null;
  provenance: Record<string, unknown> | null;
  created_at: string;
}

function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient | null {
  return sb as unknown as SupabaseClient | null;
}

export async function loadLatestInboxBrief(userId: string): Promise<InboxBrief | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  const { data, error } = await rawDb(sb)!
    .from("assets")
    .select("id, thread_id, kind, title, summary, content_ref, provenance, created_at")
    .eq("kind", "inbox_brief")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return null;

  // Filtre côté app par userId (provenance) car la jsonb query SQL n'est
  // pas trivialement portable sans index.
  const rows = data as AssetRow[];
  for (const row of rows) {
    const prov = row.provenance ?? {};
    const ownerId = (prov as { userId?: string }).userId;
    if (ownerId !== userId) continue;

    if (!row.content_ref) continue;
    try {
      const parsed = JSON.parse(row.content_ref) as InboxBrief & { _assetId?: string };
      // Inject the assetId pour que les writes (snooze) puissent mettre à jour.
      return { ...parsed, _assetId: row.id } as InboxBrief & { _assetId?: string };
    } catch (err) {
      console.warn(`[inbox/store] failed to parse content_ref for asset ${row.id}:`, err);
    }
  }
  return null;
}

export interface SnoozeResult {
  ok: boolean;
  assetId?: string;
  error?: string;
}

/**
 * Snooze un item — re-stocke l'asset avec snoozedUntil mis à jour.
 * Crée un nouveau row asset (immutable trail) plutôt que d'updater.
 */
export async function snoozeInboxItem(params: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  itemId: string;
  /** Timestamp ms de fin de snooze (par défaut demain 8h locale). */
  until?: number;
}): Promise<SnoozeResult> {
  const brief = await loadLatestInboxBrief(params.userId);
  if (!brief) return { ok: false, error: "no_brief" };

  const until = params.until ?? defaultSnoozeUntil();

  const updated: InboxItem[] = brief.items.map((it) =>
    it.id === params.itemId ? { ...it, snoozedUntil: until } : it,
  );

  if (updated.find((it) => it.id === params.itemId) === undefined) {
    return { ok: false, error: "item_not_found" };
  }

  const newBrief: InboxBrief = {
    items: updated,
    generatedAt: brief.generatedAt,
    sources: brief.sources,
    empty: brief.empty,
  };

  const { randomUUID } = await import("node:crypto");
  const newAssetId = randomUUID();
  await storeAsset({
    id: newAssetId,
    threadId: `inbox:${params.userId}`,
    kind: "inbox_brief",
    title: `Inbox · ${new Date(brief.generatedAt).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })} (snooze)`,
    summary: `${updated.length} signaux`,
    contentRef: JSON.stringify(newBrief),
    createdAt: Date.now(),
    provenance: {
      providerId: "system",
      userId: params.userId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });

  return { ok: true, assetId: newAssetId };
}

function defaultSnoozeUntil(): number {
  // demain 8h locale
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

/**
 * Daily Brief — accès au dernier brief persisté pour un user.
 *
 * Pattern aligné avec lib/inbox/store.ts. Source : table `assets` filtrée par
 * `kind: "daily_brief"` + `provenance.userId === userId`. On retourne le row
 * le plus récent dont la `targetDate` correspond à la date demandée (ou
 * aujourd'hui par défaut).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getExportSignedUrl } from "@/lib/reports/export/store";
import type {
  DailyBriefAssetMeta,
  DailyBriefNarration,
} from "./types";

export interface PersistedDailyBrief {
  assetId: string;
  title: string;
  summary: string | null;
  createdAt: number;
  narration: DailyBriefNarration;
  meta: DailyBriefAssetMeta;
  counts: {
    emails: number;
    slack: number;
    calendar: number;
    github: number;
    linear: number;
  };
  /** Signed URL fraîche (ou réutilise celle du meta si encore valide). */
  pdfUrl: string | null;
}

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Charge le brief du jour (ou de la date demandée) le plus récent pour ce
 * user. Retourne null si aucun brief n'existe pour cette date.
 *
 * Note : on regenère un signed URL à chaque appel (TTL 24h) pour ne pas
 * servir une URL expirée si l'utilisateur revient le lendemain.
 */
export async function loadDailyBriefForDate(opts: {
  userId: string;
  targetDate?: string;
}): Promise<PersistedDailyBrief | null> {
  const sb = getServerSupabase();
  if (!sb) return null;

  const targetDate = opts.targetDate ?? todayIso();

  const { data, error } = await rawDb(sb)!
    .from("assets")
    .select("id, thread_id, kind, title, summary, content_ref, provenance, created_at")
    .eq("kind", "daily_brief")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data) return null;

  const rows = data as AssetRow[];
  for (const row of rows) {
    const prov = (row.provenance ?? {}) as { userId?: string };
    if (prov.userId !== opts.userId) continue;
    if (!row.content_ref) continue;

    try {
      const parsed = JSON.parse(row.content_ref) as {
        narration: DailyBriefNarration;
        meta: DailyBriefAssetMeta;
        counts: PersistedDailyBrief["counts"];
      };
      if (parsed.meta?.targetDate !== targetDate) continue;

      // Re-sign URL — celle stockée a été générée au moment de la création
      // du job (peut avoir expiré).
      let pdfUrl = parsed.meta?.pdfUrl ?? null;
      if (parsed.meta?.storageKey) {
        try {
          pdfUrl = await getExportSignedUrl(parsed.meta.storageKey, {
            expiresInSeconds: 24 * 3600,
            downloadName: `daily-brief-${targetDate}.pdf`,
          });
        } catch (err) {
          console.warn("[daily-brief/store] re-sign URL échouée:", err);
        }
      }

      return {
        assetId: row.id,
        title: row.title,
        summary: row.summary,
        createdAt: new Date(row.created_at).getTime(),
        narration: parsed.narration,
        meta: { ...parsed.meta, pdfUrl },
        counts: parsed.counts,
        pdfUrl,
      };
    } catch (err) {
      console.warn(
        `[daily-brief/store] failed to parse content_ref for asset ${row.id}:`,
        err,
      );
    }
  }

  return null;
}

/**
 * Store reports Realtime — Zustand.
 *
 * Souscrit aux UPDATE sur la table `assets` (filtrés par id) via
 * Supabase Realtime pour rafraîchir le payload d'un rapport sans
 * rechargement de page.
 *
 * Usage :
 *   const { subscribeToReport, unsubscribeFromReport, liveReports } =
 *     useReportsStore();
 *
 * Le payload parsé est stocké dans `liveReports` (Map<assetId, RenderPayload>).
 * ReportLayout surveille cette Map et remplace son affichage si le payload
 * est plus récent que le payload initial.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";

// ── Types ────────────────────────────────────────────────────────────────────

interface ReportChannel {
  channel: ReturnType<SupabaseClient["channel"]>;
  assetId: string;
}

interface ReportsState {
  /** Payloads reçus en live, indexés par assetId. */
  liveReports: Map<string, RenderPayload>;
  /** Channels Supabase actifs, un par assetId souscrit. */
  _channels: Map<string, ReportChannel>;

  /**
   * Démarre la souscription Realtime sur un asset report.
   * Idempotent — ne crée pas deux channels pour le même assetId.
   */
  subscribeToReport: (assetId: string, tenantId: string) => void;
  /**
   * Ferme le channel Realtime pour un asset spécifique.
   * Appelé au unmount du composant qui affiche le rapport.
   */
  unsubscribeFromReport: (assetId: string) => void;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function makeSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

function parsePayload(raw: unknown): RenderPayload | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRenderPayload(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  if (isRenderPayload(raw)) return raw;
  return null;
}

function isRenderPayload(value: unknown): value is RenderPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "__reportPayload" in value &&
    (value as { __reportPayload: unknown }).__reportPayload === true
  );
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useReportsStore = create<ReportsState>()(
  subscribeWithSelector((set, get) => ({
    liveReports: new Map(),
    _channels: new Map(),

    subscribeToReport: (assetId: string, tenantId: string) => {
      // Idempotent
      if (get()._channels.has(assetId)) return;

      const sb = makeSupabaseBrowserClient();
      if (!sb) {
        console.warn(
          `[reports-store] Supabase client indisponible — pas de Realtime pour asset ${assetId}`,
        );
        return;
      }

      const channel = sb
        .channel(`report:${assetId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "assets",
            filter: `id=eq.${assetId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            // Le payload du rapport est dans content_ref (JSON stringifié ou objet)
            const parsed = parsePayload(row.content_ref);
            if (!parsed) {
              console.warn(
                `[reports-store] UPDATE reçu pour ${assetId} mais content_ref non parsable`,
              );
              return;
            }
            set((state) => {
              const next = new Map(state.liveReports);
              next.set(assetId, parsed);
              return { liveReports: next };
            });
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              `[reports-store] Realtime ${status} pour asset ${assetId} — pas de fallback`,
            );
          }
        });

      const next = new Map(get()._channels);
      next.set(assetId, { channel, assetId });
      set({ _channels: next });

      void tenantId; // utilisé dans le nom du canal pour le debug futur
    },

    unsubscribeFromReport: (assetId: string) => {
      const entry = get()._channels.get(assetId);
      if (!entry) return;

      void entry.channel.unsubscribe();

      const nextChannels = new Map(get()._channels);
      nextChannels.delete(assetId);

      const nextReports = new Map(get().liveReports);
      nextReports.delete(assetId);

      set({ _channels: nextChannels, liveReports: nextReports });
    },
  })),
);

/**
 * Store notifications in-app — Zustand.
 *
 * Consomme les API routes :
 *   GET  /api/notifications        → listNotifications
 *   POST /api/notifications/read   → markRead
 *   POST /api/notifications/read-all → markAllRead
 *
 * Transport primaire : Supabase Realtime (postgres_changes INSERT).
 * Fallback automatique : polling 60s si le channel Realtime passe en
 * CHANNEL_ERROR (réseau coupé, quota dépassé, etc.).
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AppNotification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  kind: "signal" | "report_ready" | "export_done" | "share_viewed";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  /** ID du timer de fallback polling (60s). Null si Realtime actif et sain. */
  _pollTimer: ReturnType<typeof setInterval> | null;
  /** Channel Supabase Realtime actif. Null si non encore souscrit. */
  _realtimeChannel: ReturnType<SupabaseClient["channel"]> | null;

  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /**
   * Démarre la souscription Realtime.
   * Si Realtime échoue (CHANNEL_ERROR), bascule sur polling 60s.
   * Idempotent : n'ouvre pas deux channels simultanés.
   */
  startRealtime: (tenantId: string) => void;
  /** Nettoie channel ET timer. Appelé au unmount. */
  stopRealtime: () => void;
  /** @deprecated Conservé pour compat — appelle startRealtime si tenantId dispo. */
  startPolling: () => void;
  stopPolling: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Crée un client Supabase anon (browser-safe). Retourne null si env manquant. */
function makeSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNotificationsStore = create<NotificationsState>()(
  subscribeWithSelector((set, get) => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    _pollTimer: null,
    _realtimeChannel: null,

    // ── Fetch depuis l'API REST ──────────────────────────────────────────────

    fetchNotifications: async () => {
      set({ loading: true, error: null });
      try {
        const res = await fetch("/api/notifications", {
          credentials: "include",
        });
        if (!res.ok) {
          const msg = `HTTP ${res.status}`;
          set({ loading: false, error: msg });
          return;
        }
        const data = (await res.json()) as AppNotification[];
        const unreadCount = data.filter((n) => n.read_at === null).length;
        set({ notifications: data, unreadCount, loading: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        set({ loading: false, error: msg });
      }
    },

    // ── markRead ─────────────────────────────────────────────────────────────

    markRead: async (id: string) => {
      // Optimistic update
      set((state) => {
        const updated = state.notifications.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        );
        return {
          notifications: updated,
          unreadCount: updated.filter((n) => n.read_at === null).length,
        };
      });

      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch {
        // Correction de l'état optimiste si erreur
        void get().fetchNotifications();
      }
    },

    // ── markAllRead ──────────────────────────────────────────────────────────

    markAllRead: async () => {
      const now = new Date().toISOString();
      // Optimistic update
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          read_at: n.read_at ?? now,
        })),
        unreadCount: 0,
      }));

      try {
        await fetch("/api/notifications/read-all", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        void get().fetchNotifications();
      }
    },

    // ── Realtime ─────────────────────────────────────────────────────────────

    startRealtime: (tenantId: string) => {
      // Idempotent
      if (get()._realtimeChannel !== null) return;

      // Fetch initial pour hydrater l'état
      void get().fetchNotifications();

      const sb = makeSupabaseBrowserClient();
      if (!sb) {
        // Pas de client dispo (SSR ou env manquant) → fallback polling direct
        console.warn("[notifications] Supabase client indisponible — fallback polling");
        _startFallbackPolling(set, get);
        return;
      }

      const channel = sb
        .channel(`notifications:${tenantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "in_app_notifications",
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const notif = payload.new as AppNotification;
            set((state) => ({
              notifications: [notif, ...state.notifications],
              unreadCount: state.unreadCount + 1,
            }));
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
              `[notifications] Realtime ${status} — fallback polling 60s`,
            );
            _startFallbackPolling(set, get);
          }
          if (status === "SUBSCRIBED") {
            // Realtime opérationnel : annule le fallback polling si actif
            const timer = get()._pollTimer;
            if (timer !== null) {
              clearInterval(timer);
              set({ _pollTimer: null });
            }
          }
        });

      set({ _realtimeChannel: channel });
    },

    stopRealtime: () => {
      const channel = get()._realtimeChannel;
      if (channel !== null) {
        void channel.unsubscribe();
        set({ _realtimeChannel: null });
      }
      // Nettoie aussi le fallback polling
      const timer = get()._pollTimer;
      if (timer !== null) {
        clearInterval(timer);
        set({ _pollTimer: null });
      }
    },

    // ── Compat legacy ────────────────────────────────────────────────────────

    /** @deprecated Utilise startRealtime(tenantId) à la place. */
    startPolling: () => {
      console.warn(
        "[notifications] startPolling() est déprécié — utilise startRealtime(tenantId)",
      );
      void get().fetchNotifications();
      _startFallbackPolling(set, get);
    },

    stopPolling: () => {
      const timer = get()._pollTimer;
      if (timer !== null) {
        clearInterval(timer);
        set({ _pollTimer: null });
      }
    },
  })),
);

// ── Helpers privés ────────────────────────────────────────────────────────────

/** Démarre le fallback polling 60s (idempotent). */
function _startFallbackPolling(
  set: (partial: Partial<NotificationsState>) => void,
  get: () => NotificationsState,
) {
  if (get()._pollTimer !== null) return; // déjà actif

  const timer = setInterval(() => {
    void get().fetchNotifications();
  }, 60_000);

  set({ _pollTimer: timer });
}

/**
 * Store notifications in-app — Zustand.
 *
 * Consomme les API routes :
 *   GET  /api/notifications        → listNotifications
 *   POST /api/notifications/read   → markRead
 *   POST /api/notifications/read-all → markAllRead
 *
 * Polling toutes les 30s (pas de Supabase Realtime pour l'instant).
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

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
  /** Timer ID du polling (pour cleanup). */
  _pollTimer: ReturnType<typeof setInterval> | null;

  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Démarre le polling 30s. Idempotent : n'en démarre pas deux. */
  startPolling: () => void;
  stopPolling: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  subscribeWithSelector((set, get) => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    _pollTimer: null,

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
        // On re-fetch pour corriger l'état optimiste si erreur
        void get().fetchNotifications();
      }
    },

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

    startPolling: () => {
      if (get()._pollTimer !== null) return; // déjà actif

      // Fetch immédiat
      void get().fetchNotifications();

      const timer = setInterval(() => {
        void get().fetchNotifications();
      }, 30_000);

      set({ _pollTimer: timer });
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

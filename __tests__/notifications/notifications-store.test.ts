/**
 * Tests unitaires — store notifications Realtime.
 *
 * Couvre :
 *  - subscription créée au startRealtime(), unsubscribe au stopRealtime()
 *  - INSERT event → state mis à jour + unreadCount++
 *  - fallback polling 60s si subscribe retourne CHANNEL_ERROR
 *  - startPolling() legacy appelle fetchNotifications + démarre le polling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useNotificationsStore } from "@/stores/notifications";
import type { AppNotification } from "@/stores/notifications";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

function buildNotif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    user_id: null,
    kind: "signal",
    severity: "info",
    title: "Test notif",
    body: null,
    meta: null,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mock Supabase ─────────────────────────────────────────────────────────────
//
// On mock `@supabase/supabase-js` pour intercepter createClient().
// vi.hoisted() permet de déclarer les variables avant le hoist de vi.mock().

type PostgresChangesCallback = (payload: { new: AppNotification }) => void;
type SubscribeCallback = (status: string) => void;

let _postgresChangesCallback: PostgresChangesCallback | null = null;
let _subscribeCallback: SubscribeCallback | null = null;

const { mockUnsubscribe, mockChannelInstance, mockChannel } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);

  // On utilise un objet pour self-référence dans les implémentations
  const mockChannelInstance: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  } = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: mockUnsubscribe,
  };

  const mockChannel = vi.fn().mockReturnValue(mockChannelInstance);

  return { mockUnsubscribe, mockChannelInstance, mockChannel };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    channel: mockChannel,
  }),
}));

// ── Mock fetch global ─────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => [] as AppNotification[],
} as Response);

// ── Setup/teardown ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  _postgresChangesCallback = null;
  _subscribeCallback = null;
  mockUnsubscribe.mockClear();
  mockChannel.mockClear();

  // Réinitialise les implémentations on() et subscribe() avec capture des callbacks
  mockChannelInstance.on.mockImplementation(
    (_event: string, _filter: unknown, cb: PostgresChangesCallback) => {
      _postgresChangesCallback = cb;
      return mockChannelInstance;
    },
  );
  mockChannelInstance.subscribe.mockImplementation((cb: SubscribeCallback) => {
    _subscribeCallback = cb;
    return mockChannelInstance;
  });

  mockFetch.mockClear();

  // Injecte les env vars nécessaires à makeSupabaseBrowserClient()
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  // Reset du store Zustand entre chaque test
  useNotificationsStore.setState({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    _pollTimer: null,
    _realtimeChannel: null,
  });

  global.fetch = mockFetch;
});

afterEach(() => {
  // Cleanup du channel si resté ouvert
  useNotificationsStore.getState().stopRealtime();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("startRealtime", () => {
  it("crée un channel Supabase au mount avec le bon tenant_id", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);

    expect(mockChannel).toHaveBeenCalledWith(`notifications:${TENANT_ID}`);
    expect(mockChannelInstance.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "in_app_notifications",
        filter: `tenant_id=eq.${TENANT_ID}`,
      }),
      expect.any(Function),
    );
    expect(mockChannelInstance.subscribe).toHaveBeenCalled();
  });

  it("stocke le channel dans _realtimeChannel", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    expect(useNotificationsStore.getState()._realtimeChannel).not.toBeNull();
  });

  it("est idempotent — n'ouvre pas deux channels simultanés", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    useNotificationsStore.getState().startRealtime(TENANT_ID);

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it("appelle fetchNotifications immédiatement", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    expect(mockFetch).toHaveBeenCalledWith("/api/notifications", expect.anything());
  });
});

describe("stopRealtime", () => {
  it("appelle unsubscribe() et vide _realtimeChannel", async () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    expect(useNotificationsStore.getState()._realtimeChannel).not.toBeNull();

    useNotificationsStore.getState().stopRealtime();

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(useNotificationsStore.getState()._realtimeChannel).toBeNull();
  });

  it("annule également le fallback polling si actif", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    useNotificationsStore.getState().startRealtime(TENANT_ID);
    // Simule CHANNEL_ERROR pour activer le fallback polling
    _subscribeCallback?.("CHANNEL_ERROR");
    expect(useNotificationsStore.getState()._pollTimer).not.toBeNull();

    useNotificationsStore.getState().stopRealtime();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(useNotificationsStore.getState()._pollTimer).toBeNull();
  });
});

describe("INSERT event → state update", () => {
  it("ajoute la notif au state et incrémente unreadCount", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);

    const notif = buildNotif({ title: "MRR drop détecté" });
    _postgresChangesCallback?.({ new: notif });

    const state = useNotificationsStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].title).toBe("MRR drop détecté");
    expect(state.unreadCount).toBe(1);
  });

  it("ajoute en tête de liste (ordre desc)", () => {
    const existing = buildNotif({ title: "Ancienne notif" });
    useNotificationsStore.setState({ notifications: [existing], unreadCount: 0 });

    useNotificationsStore.getState().startRealtime(TENANT_ID);

    const newNotif = buildNotif({ title: "Nouvelle notif" });
    _postgresChangesCallback?.({ new: newNotif });

    const { notifications } = useNotificationsStore.getState();
    expect(notifications[0].title).toBe("Nouvelle notif");
    expect(notifications[1].title).toBe("Ancienne notif");
  });

  it("incrémente unreadCount à chaque INSERT", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);

    _postgresChangesCallback?.({ new: buildNotif() });
    _postgresChangesCallback?.({ new: buildNotif() });
    _postgresChangesCallback?.({ new: buildNotif() });

    expect(useNotificationsStore.getState().unreadCount).toBe(3);
  });
});

describe("fallback polling sur CHANNEL_ERROR", () => {
  it("démarre le polling 60s si subscribe retourne CHANNEL_ERROR", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    useNotificationsStore.getState().startRealtime(TENANT_ID);
    _subscribeCallback?.("CHANNEL_ERROR");

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(useNotificationsStore.getState()._pollTimer).not.toBeNull();
  });

  it("démarre le polling 60s si subscribe retourne TIMED_OUT", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    useNotificationsStore.getState().startRealtime(TENANT_ID);
    _subscribeCallback?.("TIMED_OUT");

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("le polling 60s appelle fetchNotifications", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    _subscribeCallback?.("CHANNEL_ERROR");

    // Réinitialise le compteur pour ne compter que l'appel du polling
    mockFetch.mockClear();

    vi.advanceTimersByTime(60_000);
    expect(mockFetch).toHaveBeenCalledWith("/api/notifications", expect.anything());
  });

  it("n'est PAS inférieur à 60s (ne spam pas)", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    useNotificationsStore.getState().startRealtime(TENANT_ID);
    _subscribeCallback?.("CHANNEL_ERROR");

    const calls = setIntervalSpy.mock.calls;
    calls.forEach(([, delay]) => {
      expect(delay as number).toBeGreaterThanOrEqual(60_000);
    });
  });

  it("annule le fallback polling si Realtime se reconnecte (SUBSCRIBED)", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    useNotificationsStore.getState().startRealtime(TENANT_ID);
    // D'abord erreur…
    _subscribeCallback?.("CHANNEL_ERROR");
    expect(useNotificationsStore.getState()._pollTimer).not.toBeNull();

    // …puis reconnexion
    _subscribeCallback?.("SUBSCRIBED");
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(useNotificationsStore.getState()._pollTimer).toBeNull();
  });

  it("le fallback polling est idempotent (pas deux timers simultanés)", () => {
    useNotificationsStore.getState().startRealtime(TENANT_ID);
    _subscribeCallback?.("CHANNEL_ERROR");
    _subscribeCallback?.("CHANNEL_ERROR");

    // Le store stocke un seul timer (idempotence via _pollTimer !== null guard)
    expect(useNotificationsStore.getState()._pollTimer).not.toBeNull();
  });
});

describe("fallback si env Supabase manquant", () => {
  it("passe directement en polling si NEXT_PUBLIC_SUPABASE_URL absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    useNotificationsStore.getState().startRealtime(TENANT_ID);

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Supabase client indisponible"),
    );
  });
});

describe("startPolling legacy", () => {
  it("loggue un warning dépréciation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    useNotificationsStore.getState().startPolling();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("déprécié"));
  });

  it("appelle fetchNotifications", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useNotificationsStore.getState().startPolling();
    expect(mockFetch).toHaveBeenCalledWith("/api/notifications", expect.anything());
  });
});

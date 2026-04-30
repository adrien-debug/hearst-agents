/**
 * Tests — stores/reports.ts (Realtime Supabase)
 *
 * On mocke le client Supabase pour vérifier :
 *   1. subscribe → canal créé avec le bon filter
 *   2. UPDATE event → liveReports mis à jour avec le payload parsé
 *   3. unsubscribe → cleanup du channel et de liveReports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock env ─────────────────────────────────────────────────────────────────
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

// ── Mock @supabase/supabase-js ────────────────────────────────────────────────

type EventHandler = (payload: { new: Record<string, unknown> }) => void;

interface MockChannelState {
  channelName: string;
  filter: string | null;
  handler: EventHandler | null;
  subscribeCallback: ((status: string) => void) | null;
  unsubscribed: boolean;
}

const mockChannelState: MockChannelState = {
  channelName: "",
  filter: null,
  handler: null,
  subscribeCallback: null,
  unsubscribed: false,
};

const mockChannel = {
  on: vi.fn().mockImplementation(
    (
      _type: string,
      opts: { filter?: string },
      handler: EventHandler,
    ) => {
      mockChannelState.filter = opts?.filter ?? null;
      mockChannelState.handler = handler;
      return mockChannel;
    },
  ),
  subscribe: vi.fn().mockImplementation((cb: (status: string) => void) => {
    mockChannelState.subscribeCallback = cb;
    return mockChannel;
  }),
  unsubscribe: vi.fn().mockImplementation(() => {
    mockChannelState.unsubscribed = true;
    return Promise.resolve();
  }),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockImplementation((name: string) => {
      mockChannelState.channelName = name;
      mockChannelState.unsubscribed = false;
      return mockChannel;
    }),
  }),
}));

// ── Mock next-auth (non requis dans le store, mais présent dans ReportLayout) ─
vi.mock("next-auth/react", () => ({
  useSession: vi.fn().mockReturnValue({ data: null }),
}));

// ── Import du store APRÈS les mocks ──────────────────────────────────────────
import { useReportsStore } from "@/stores/reports";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ASSET_ID = "asset-123";
const TENANT_ID = "tenant-abc";

const PAYLOAD_V1 = {
  __reportPayload: true as const,
  specId: "spec-1",
  version: 1,
  generatedAt: 1_000_000,
  blocks: [],
  scalars: {},
};

const PAYLOAD_V2 = {
  __reportPayload: true as const,
  specId: "spec-1",
  version: 2,
  generatedAt: 2_000_000,
  blocks: [],
  scalars: {},
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useReportsStore", () => {
  beforeEach(() => {
    // Reset du store Zustand entre chaque test
    useReportsStore.setState({
      liveReports: new Map(),
      _channels: new Map(),
    });
    // Reset mock state
    mockChannelState.channelName = "";
    mockChannelState.filter = null;
    mockChannelState.handler = null;
    mockChannelState.subscribeCallback = null;
    mockChannelState.unsubscribed = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup channels restants
    useReportsStore.getState().unsubscribeFromReport(ASSET_ID);
  });

  it("crée un canal Supabase avec le bon filter au subscribe", () => {
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    expect(mockChannelState.channelName).toBe(`report:${ASSET_ID}`);
    expect(mockChannelState.filter).toBe(`id=eq.${ASSET_ID}`);
  });

  it("est idempotent — ne crée pas deux channels pour le même assetId", async () => {
    const { createClient } = vi.mocked(await import("@supabase/supabase-js"));

    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    // channel() appelé une seule fois
    expect(createClient().channel).toHaveBeenCalledTimes(1);
  });

  it("met à jour liveReports à la réception d'un UPDATE event (content_ref JSON string)", () => {
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    // Simule un UPDATE Postgres avec content_ref stringifié
    mockChannelState.handler!({
      new: { id: ASSET_ID, content_ref: JSON.stringify(PAYLOAD_V2) },
    });

    const live = useReportsStore.getState().liveReports.get(ASSET_ID);
    expect(live).toBeDefined();
    expect(live!.generatedAt).toBe(PAYLOAD_V2.generatedAt);
    expect(live!.version).toBe(2);
  });

  it("met à jour liveReports à la réception d'un UPDATE event (content_ref objet)", () => {
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    // Simule un UPDATE Postgres avec content_ref déjà parsé (objet)
    mockChannelState.handler!({
      new: { id: ASSET_ID, content_ref: PAYLOAD_V2 },
    });

    const live = useReportsStore.getState().liveReports.get(ASSET_ID);
    expect(live?.generatedAt).toBe(PAYLOAD_V2.generatedAt);
  });

  it("ignore un UPDATE dont content_ref n'est pas un RenderPayload valide", () => {
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    mockChannelState.handler!({
      new: { id: ASSET_ID, content_ref: "not-json-{{{" },
    });

    const live = useReportsStore.getState().liveReports.get(ASSET_ID);
    expect(live).toBeUndefined();
  });

  it("unsubscribe ferme le channel et supprime liveReports", () => {
    useReportsStore.getState().subscribeToReport(ASSET_ID, TENANT_ID);

    // Hydrate un live payload
    mockChannelState.handler!({
      new: { id: ASSET_ID, content_ref: PAYLOAD_V1 },
    });

    useReportsStore.getState().unsubscribeFromReport(ASSET_ID);

    expect(mockChannelState.unsubscribed).toBe(true);
    expect(useReportsStore.getState()._channels.has(ASSET_ID)).toBe(false);
    expect(useReportsStore.getState().liveReports.has(ASSET_ID)).toBe(false);
  });

  it("unsubscribe est sans effet si l'assetId n'est pas souscrit", () => {
    // Ne doit pas throw
    expect(() => {
      useReportsStore.getState().unsubscribeFromReport("non-existant-id");
    }).not.toThrow();
  });
});

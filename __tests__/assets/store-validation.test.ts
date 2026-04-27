/**
 * Asset persistence — server-side title validation.
 *
 * Both write paths (`lib/assets/types.ts:storeAsset` and
 * `lib/engine/runtime/assets/adapter.ts:saveAsset`) refuse to persist
 * assets with empty / "Untitled" titles. Verifies the guard at the source
 * eliminates the ghost rows that were polluting the right panel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock for storeAsset (orchestrator path) ───────────────────
const upsertMock = vi.fn().mockReturnValue({ then: () => undefined });

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

// ── Mock for saveAsset (API route path) ───────────────────────
const adapterUpsertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({ upsert: adapterUpsertMock }),
  })),
}));

// ── Imports after mocks ───────────────────────────────────────
import { storeAsset } from "@/lib/assets/types";
import type { Asset as OrchestratorAsset } from "@/lib/assets/types";
import { saveAsset } from "@/lib/engine/runtime/assets/adapter";
import type { Asset as RuntimeAsset } from "@/lib/engine/runtime/assets/types";

beforeEach(() => {
  upsertMock.mockReset().mockReturnValue({ then: () => undefined });
  adapterUpsertMock.mockReset().mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

function orchestratorAsset(title: string): OrchestratorAsset {
  return {
    id: "asset-1",
    threadId: "thread-1",
    kind: "report",
    title,
    summary: "",
    outputTier: "report",
    provenance: { providerId: "google", sentAt: 0 },
    createdAt: 1700000000000,
    contentRef: "",
    runId: "run-1",
  };
}

function runtimeAsset(name: string): RuntimeAsset {
  return {
    id: "asset-1",
    type: "doc",
    name,
    run_id: "run-1",
    tenantId: "t",
    workspaceId: "w",
    created_at: 1700000000000,
    metadata: {},
  };
}

describe("storeAsset — orchestrator path", () => {
  it("persists when title is a real string", () => {
    storeAsset(orchestratorAsset("Synthèse mensuelle"));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      title: "Synthèse mensuelle",
    });
  });

  it("rejects empty title", () => {
    storeAsset(orchestratorAsset(""));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only title", () => {
    storeAsset(orchestratorAsset("   "));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects 'Untitled' (exact match)", () => {
    storeAsset(orchestratorAsset("Untitled"));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects 'untitled' (lowercase)", () => {
    storeAsset(orchestratorAsset("untitled"));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects ' Untitled ' (padded)", () => {
    storeAsset(orchestratorAsset(" Untitled "));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("trims valid titles before persisting", () => {
    storeAsset(orchestratorAsset("  Hello world  "));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].title).toBe("Hello world");
  });

  it("accepts 'Untitled report' (Untitled is a prefix, not the whole title)", () => {
    storeAsset(orchestratorAsset("Untitled report v2"));
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

describe("saveAsset — API path (adapter)", () => {
  it("persists when name is set", async () => {
    const ok = await saveAsset(runtimeAsset("Quarterly KPIs"));
    expect(ok).toBe(true);
    expect(adapterUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty name", async () => {
    const ok = await saveAsset(runtimeAsset(""));
    expect(ok).toBe(false);
    expect(adapterUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only name", async () => {
    const ok = await saveAsset(runtimeAsset("\t\t"));
    expect(ok).toBe(false);
    expect(adapterUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects 'Untitled'", async () => {
    const ok = await saveAsset(runtimeAsset("Untitled"));
    expect(ok).toBe(false);
    expect(adapterUpsertMock).not.toHaveBeenCalled();
  });

  it("uses the trimmed name in the persisted row", async () => {
    await saveAsset(runtimeAsset("  Hello  "));
    expect(adapterUpsertMock).toHaveBeenCalledTimes(1);
    expect(adapterUpsertMock.mock.calls[0][0].title).toBe("Hello");
  });
});

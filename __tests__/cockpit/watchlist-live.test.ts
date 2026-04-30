/**
 * Tests watchlist live — mocks Composio responses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: vi.fn(),
}));

import { getLiveWatchlist, _resetWatchlistCache } from "@/lib/cockpit/watchlist-live";
import { executeComposioAction } from "@/lib/connectors/composio/client";

const SCOPE = { userId: "u1", tenantId: "t1" };

describe("getLiveWatchlist", () => {
  beforeEach(() => {
    _resetWatchlistCache();
    vi.mocked(executeComposioAction).mockReset();
  });

  it("retourne CTA fallback si toutes les sources fail", async () => {
    vi.mocked(executeComposioAction).mockResolvedValue({
      ok: false,
      error: "auth required",
      errorCode: "AUTH_REQUIRED",
    });
    const items = await getLiveWatchlist(SCOPE);
    expect(items).toHaveLength(4);
    const mrr = items.find((i) => i.id === "mrr")!;
    expect(mrr.value).toBe("—");
    expect(mrr.delta).toContain("Connecte Stripe");
    const pipeline = items.find((i) => i.id === "pipeline")!;
    expect(pipeline.delta).toContain("Connecte HubSpot");
  });

  it("calcule MRR à partir des subscriptions Stripe (cents → euros, monthly)", async () => {
    vi.mocked(executeComposioAction).mockImplementation(async ({ action }) => {
      if (action === "STRIPE_LIST_SUBSCRIPTIONS") {
        return {
          ok: true,
          data: {
            data: [
              {
                status: "active",
                items: {
                  data: [
                    { price: { unit_amount: 9900, recurring: { interval: "month", interval_count: 1 } } },
                  ],
                },
              },
              {
                status: "active",
                items: {
                  data: [
                    { price: { unit_amount: 120000, recurring: { interval: "year", interval_count: 1 } } },
                  ],
                },
              },
            ],
          },
        };
      }
      return { ok: false, error: "skip" };
    });

    const items = await getLiveWatchlist(SCOPE);
    const mrr = items.find((i) => i.id === "mrr")!;
    // 99€ + (1200€ / 12) = 99 + 100 = 199€
    expect(mrr.value).toContain("199");
    const arr = items.find((i) => i.id === "arr")!;
    // ARR = MRR × 12 = 2388€ → "2.4k €"
    expect(arr.value).toMatch(/k €/);
  });

  it("calcule pipeline weighted depuis HubSpot deals", async () => {
    vi.mocked(executeComposioAction).mockImplementation(async ({ action }) => {
      if (action === "HUBSPOT_LIST_DEALS") {
        return {
          ok: true,
          data: {
            data: [
              { properties: { amount: "10000", hs_deal_stage_probability: "0.5", dealstage: "qualified" } },
              { properties: { amount: "5000", hs_deal_stage_probability: "100", dealstage: "negotiation" } },
              { properties: { amount: "20000", dealstage: "closedwon" } }, // exclu
            ],
          },
        };
      }
      return { ok: false, error: "skip" };
    });

    const items = await getLiveWatchlist(SCOPE);
    const pipeline = items.find((i) => i.id === "pipeline")!;
    // 10000 × 0.5 + 5000 × 1.0 = 10000
    expect(pipeline.value).toContain("10");
    expect(pipeline.delta).toContain("2 deals");
  });

  it("cache 5min — second call ne retape pas Composio", async () => {
    vi.mocked(executeComposioAction).mockResolvedValue({
      ok: false,
      error: "fail",
    });
    await getLiveWatchlist(SCOPE);
    const callsAfter1 = vi.mocked(executeComposioAction).mock.calls.length;
    await getLiveWatchlist(SCOPE);
    expect(vi.mocked(executeComposioAction).mock.calls.length).toBe(callsAfter1);
  });
});

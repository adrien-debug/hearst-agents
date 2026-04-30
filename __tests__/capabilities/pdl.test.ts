/**
 * Tests PDL provider — error handling + cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enrichCompany,
  isPdlConfigured,
  PdlUnavailableError,
  _resetPdlCache,
} from "@/lib/capabilities/providers/pdl";

const ORIGINAL_KEY = process.env.PDL_API_KEY;

describe("PDL provider", () => {
  beforeEach(() => {
    _resetPdlCache();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.PDL_API_KEY;
    else process.env.PDL_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("isPdlConfigured = false sans clé", () => {
    delete process.env.PDL_API_KEY;
    expect(isPdlConfigured()).toBe(false);
  });

  it("throw PdlUnavailableError sans clé", async () => {
    delete process.env.PDL_API_KEY;
    await expect(enrichCompany({ domain: "x.com" })).rejects.toBeInstanceOf(
      PdlUnavailableError,
    );
  });

  it("retourne PdlCompany normalisée", async () => {
    process.env.PDL_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Stripe",
        industry: "fintech",
        size: "1001-5000",
        founded: 2010,
        employee_count: 4000,
        total_funding_raised: 9000000000,
        last_funding_stage: "Series I",
        location: { locality: "San Francisco", country: "United States" },
        linkedin_url: "https://linkedin.com/company/stripe",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await enrichCompany({ domain: "https://stripe.com/" });
    expect(out.domain).toBe("stripe.com");
    expect(out.name).toBe("Stripe");
    expect(out.industry).toBe("fintech");
    expect(out.headcount).toBe(4000);
    expect(out.fundingStage).toBe("Series I");
  });

  it("cache hit évite un second fetch", async () => {
    process.env.PDL_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Y" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await enrichCompany({ domain: "y.com" });
    await enrichCompany({ domain: "y.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

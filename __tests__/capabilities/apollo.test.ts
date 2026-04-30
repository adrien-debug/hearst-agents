/**
 * Tests Apollo provider — error handling + cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enrichPerson,
  isApolloConfigured,
  ApolloUnavailableError,
  _resetApolloCache,
} from "@/lib/capabilities/providers/apollo";

const ORIGINAL_KEY = process.env.APOLLO_API_KEY;

describe("Apollo provider", () => {
  beforeEach(() => {
    _resetApolloCache();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.APOLLO_API_KEY;
    else process.env.APOLLO_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("isApolloConfigured = false sans clé", () => {
    delete process.env.APOLLO_API_KEY;
    expect(isApolloConfigured()).toBe(false);
  });

  it("throw ApolloUnavailableError sans clé", async () => {
    delete process.env.APOLLO_API_KEY;
    await expect(enrichPerson({ email: "a@b.com" })).rejects.toBeInstanceOf(
      ApolloUnavailableError,
    );
  });

  it("retourne ApolloPerson normalisée", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        person: {
          name: "Ada Lovelace",
          first_name: "Ada",
          last_name: "Lovelace",
          title: "CTO",
          organization: { name: "Analytical Engines", primary_domain: "analytical.io" },
          linkedin_url: "https://linkedin.com/in/ada",
          email: "ada@analytical.io",
          city: "London",
          country: "UK",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await enrichPerson({ email: "Ada@Analytical.IO" });
    expect(out.name).toBe("Ada Lovelace");
    expect(out.title).toBe("CTO");
    expect(out.companyDomain).toBe("analytical.io");
    expect(out.linkedin).toContain("linkedin.com");
  });

  it("cache hit évite un second fetch", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ person: { name: "X" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await enrichPerson({ email: "x@y.com" });
    await enrichPerson({ email: "x@y.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

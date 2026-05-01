import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/capabilities/providers/pdl", async () => {
  const actual = await vi.importActual<typeof import("@/lib/capabilities/providers/pdl")>(
    "@/lib/capabilities/providers/pdl",
  );
  return {
    ...actual,
    enrichCompany: vi.fn(),
    PdlUnavailableError: actual.PdlUnavailableError,
  };
});

vi.mock("@/lib/capabilities/providers/apollo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/capabilities/providers/apollo")>(
    "@/lib/capabilities/providers/apollo",
  );
  return {
    ...actual,
    enrichPerson: vi.fn(),
    ApolloUnavailableError: actual.ApolloUnavailableError,
  };
});

import { buildEnrichTools } from "@/lib/tools/native/enrich";
import * as pdl from "@/lib/capabilities/providers/pdl";
import * as apollo from "@/lib/capabilities/providers/apollo";

describe("buildEnrichTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expose 2 tools : enrich_company + enrich_contact", () => {
    const tools = buildEnrichTools();
    expect(Object.keys(tools).sort()).toEqual(["enrich_company", "enrich_contact"]);
  });

  describe("enrich_company", () => {
    it("formate le résultat PDL en multiline lisible (skip raw blob)", async () => {
      vi.mocked(pdl.enrichCompany).mockResolvedValue({
        name: "Stripe",
        domain: "stripe.com",
        industry: "Financial Services",
        size: "1001-5000",
        founded: 2010,
        headcount: 4500,
        funding: 8700000000,
        fundingStage: "Series I",
        hq: { city: "South San Francisco", country: "United States" },
        linkedin: "https://linkedin.com/company/stripe",
        raw: { internal: "blob ignored" },
      });

      const tools = buildEnrichTools();
      const result = (await tools.enrich_company.execute!(
        { domain: "stripe.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      )) as string;

      expect(result).toContain("Stripe");
      expect(result).toContain("Financial Services");
      expect(result).toContain("4500");
      expect(result).toContain("Series I");
      expect(result).toContain("South San Francisco, United States");
      expect(result).not.toContain("blob ignored");
    });

    it("retourne message d'erreur lisible si PDL non configuré (PdlUnavailableError)", async () => {
      vi.mocked(pdl.enrichCompany).mockRejectedValue(new pdl.PdlUnavailableError());

      const tools = buildEnrichTools();
      const result = (await tools.enrich_company.execute!(
        { domain: "x.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      )) as string;

      expect(result).toContain("indisponible");
    });

    it("retourne message d'erreur préfixé du domaine sur autre erreur", async () => {
      vi.mocked(pdl.enrichCompany).mockRejectedValue(new Error("rate_limited"));

      const tools = buildEnrichTools();
      const result = (await tools.enrich_company.execute!(
        { domain: "x.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      )) as string;

      expect(result).toContain("x.com");
      expect(result).toContain("rate_limited");
    });
  });

  describe("enrich_contact", () => {
    it("formate le résultat Apollo en multiline lisible", async () => {
      vi.mocked(apollo.enrichPerson).mockResolvedValue({
        name: "Patrick Collison",
        firstName: "Patrick",
        lastName: "Collison",
        title: "CEO",
        company: "Stripe",
        companyDomain: "stripe.com",
        linkedin: "https://linkedin.com/in/patrickcollison",
        email: "patrick@stripe.com",
        city: "San Francisco",
        country: "USA",
        raw: { internal: "blob ignored" },
      });

      const tools = buildEnrichTools();
      const result = (await tools.enrich_contact.execute!(
        { email: "patrick@stripe.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      )) as string;

      expect(result).toContain("Patrick Collison");
      expect(result).toContain("CEO");
      expect(result).toContain("Stripe (stripe.com)");
      expect(result).toContain("San Francisco, USA");
      expect(result).not.toContain("blob ignored");
    });

    it("retourne message d'erreur lisible si Apollo non configuré", async () => {
      vi.mocked(apollo.enrichPerson).mockRejectedValue(new apollo.ApolloUnavailableError());

      const tools = buildEnrichTools();
      const result = (await tools.enrich_contact.execute!(
        { email: "x@y.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      )) as string;

      expect(result).toContain("indisponible");
    });
  });
});

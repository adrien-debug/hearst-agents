/**
 * Capability Guard Tests
 */

import { describe, it, expect } from "vitest";
import { capabilityGuard } from "@/lib/capabilities/guard";

describe("capabilityGuard", () => {
  it("allows KnowledgeRetriever for communication domain", () => {
    const r = capabilityGuard({ agent: "KnowledgeRetriever", task: "emails", domain: "communication" });
    expect(r.allowed).toBe(true);
  });

  it("allows FinanceAgent for finance domain", () => {
    const r = capabilityGuard({ agent: "FinanceAgent", task: "stripe balance", domain: "finance" });
    expect(r.allowed).toBe(true);
  });

  it("blocks FinanceAgent for communication domain with suggested agents", () => {
    const r = capabilityGuard({ agent: "FinanceAgent", task: "emails", domain: "communication" });
    expect(r.allowed).toBe(false);
    expect(r.suggestedAgents).toBeDefined();
    expect(r.suggestedAgents!.length).toBeGreaterThan(0);
    expect(r.reason).toContain("not allowed");
  });

  it("blocks DeveloperAgent for finance domain", () => {
    const r = capabilityGuard({ agent: "DeveloperAgent", task: "balance", domain: "finance" });
    expect(r.allowed).toBe(false);
    expect(r.suggestedAgents).toContain("FinanceAgent");
  });

  it("allows general agents (DocBuilder) in any domain", () => {
    const r = capabilityGuard({ agent: "DocBuilder", task: "emails", domain: "communication" });
    expect(r.allowed).toBe(true);
  });

  it("infers domain from task when not provided", () => {
    const r = capabilityGuard({ agent: "FinanceAgent", task: "Montre-moi mes emails" });
    expect(r.allowed).toBe(false);
    expect(r.domain).toBe("communication");
  });

  it("allows any agent in general domain", () => {
    const r = capabilityGuard({ agent: "KnowledgeRetriever", task: "bonjour", domain: "general" });
    expect(r.allowed).toBe(true);
  });
});

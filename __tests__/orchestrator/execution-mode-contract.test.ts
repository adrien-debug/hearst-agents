/**
 * Execution Mode Contract Tests
 *
 * Validates that resolveExecutionMode (capability router) produces
 * the expected mode for various domain/message combinations.
 */

import { describe, it, expect } from "vitest";
import { resolveCapabilityScope, resolveExecutionMode } from "@/lib/capabilities/router";

describe("resolveExecutionMode — contract snapshots", () => {
  it("simple greeting → direct_answer", () => {
    const scope = resolveCapabilityScope("bonjour");
    const d = resolveExecutionMode(scope, "bonjour");
    expect(d.mode).toBe("direct_answer");
  });

  it("email request → workflow (provider-backed)", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails");
    const d = resolveExecutionMode(scope, "Montre-moi mes emails");
    expect(d.mode).toBe("workflow");
    expect(d.backend).toBe("hearst_runtime");
  });

  it("autonomous research → custom_agent", () => {
    const scope = resolveCapabilityScope("Analyse les tendances crypto");
    const d = resolveExecutionMode(scope, "Analyse les tendances crypto");
    expect(d.mode).toBe("custom_agent");
    expect(d.backend).toBe("hearst_runtime");
  });

  it("memory request → custom_agent", () => {
    const scope = resolveCapabilityScope("Souviens-toi de mon adresse");
    const d = resolveExecutionMode(scope, "Souviens-toi de mon adresse");
    expect(d.mode).toBe("custom_agent");
  });

  it("calendar surface → workflow", () => {
    const scope = resolveCapabilityScope("Quels sont mes rendez-vous ?", "calendar");
    const d = resolveExecutionMode(scope, "Quels sont mes rendez-vous ?");
    expect(d.mode).toBe("workflow");
  });

  it("deterministic: same input always same output", () => {
    const scope = resolveCapabilityScope("Montre-moi mes fichiers Drive");
    const results = Array.from({ length: 10 }, () => resolveExecutionMode(scope, "Montre-moi mes fichiers Drive"));
    const modes = new Set(results.map((r) => r.mode));
    expect(modes.size).toBe(1);
  });
});

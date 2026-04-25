import { describe, it, expect } from "vitest";
import { validateOutput } from "@/lib/engine/runtime/output-validator";

describe("validateOutput", () => {
  it("returns valid for normal output without policy", () => {
    const r = validateOutput("Hello world");
    expect(r.classification).toBe("valid");
    expect(r.trust).toBe("unverified");
    expect(r.score).toBe(1);
  });

  it("returns invalid for empty output", () => {
    const r = validateOutput("");
    expect(r.classification).toBe("invalid");
    expect(r.trust).toBe("guard_failed");
    expect(r.score).toBe(0);
  });

  it("returns stubbed for stub context", () => {
    const r = validateOutput("stubbed data", { is_stub: true });
    expect(r.classification).toBe("valid");
    expect(r.trust).toBe("stubbed");
  });

  it("returns tool_backed when tool backing", () => {
    const r = validateOutput("api result", { has_tool_backing: true });
    expect(r.trust).toBe("tool_backed");
  });

  it("runs policy and returns valid", () => {
    const r = validateOutput('{"a":1}', {
      policy: { expect_json: true, min_output_chars: 1, max_output_chars: 1000 },
    });
    expect(r.classification).toBe("valid");
    expect(r.score).toBe(1);
    expect(r.checks_passed).toBeGreaterThanOrEqual(3);
  });

  it("runs policy and returns invalid when all fail", () => {
    const r = validateOutput("short", {
      policy: { expect_json: true, min_output_chars: 100 },
    });
    expect(r.classification).toBe("invalid");
    expect(r.failed_guards.length).toBeGreaterThan(0);
  });

  it("returns suspect when some checks pass some fail", () => {
    const r = validateOutput("valid text content here", {
      policy: {
        expect_json: true,
        min_output_chars: 1,
        max_output_chars: 10000,
      },
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(["suspect", "invalid"]).toContain(r.classification);
  });

  it("includes policy_result when policy provided", () => {
    const r = validateOutput("hello", { policy: {} });
    expect(r.policy_result).toBeDefined();
    expect(r.policy_result!.checks.length).toBeGreaterThanOrEqual(1);
  });

  it("reports failed_guards correctly", () => {
    const r = validateOutput("contains evil stuff", {
      policy: { blacklist: ["evil"] },
    });
    expect(r.failed_guards).toContain("blacklist");
  });
});

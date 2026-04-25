import { describe, it, expect } from "vitest";
import {
  checkOutputBasicGuards,
  checkJsonStructure,
  checkOutputSize,
  checkOutputRegex,
  checkOutputBlacklist,
  applyAgentGuardPolicy,
  determineOutputTrust,
} from "@/lib/engine/runtime/prompt-guard";

describe("checkOutputBasicGuards", () => {
  it("fails on empty string", () => {
    const r = checkOutputBasicGuards("");
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("Empty");
  });

  it("fails on whitespace-only", () => {
    const r = checkOutputBasicGuards("   ");
    expect(r.passed).toBe(false);
  });

  it("passes on normal output", () => {
    const r = checkOutputBasicGuards("Hello, world!");
    expect(r.passed).toBe(true);
  });

  it("fails on very large output", () => {
    const r = checkOutputBasicGuards("x".repeat(600_000));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("500k");
  });
});

describe("checkJsonStructure", () => {
  it("passes on valid JSON object", () => {
    expect(checkJsonStructure('{"key":"value"}').passed).toBe(true);
  });

  it("passes on valid JSON array", () => {
    expect(checkJsonStructure('[1,2,3]').passed).toBe(true);
  });

  it("fails on plain text", () => {
    const r = checkJsonStructure("not json");
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("not valid JSON");
  });
});

describe("checkOutputSize", () => {
  it("passes when within bounds", () => {
    expect(checkOutputSize("hello", 1, 100).passed).toBe(true);
  });

  it("fails when too short", () => {
    const r = checkOutputSize("hi", 10, 100);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("too short");
  });

  it("fails when too long", () => {
    const r = checkOutputSize("x".repeat(200), 1, 100);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("too long");
  });

  it("passes with no limits", () => {
    expect(checkOutputSize("anything").passed).toBe(true);
  });
});

describe("checkOutputRegex", () => {
  it("passes when mustMatch matches", () => {
    const r = checkOutputRegex("hello world", [/hello/]);
    expect(r.passed).toBe(true);
  });

  it("fails when mustMatch does not match", () => {
    const r = checkOutputRegex("goodbye", [/hello/]);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("does not match");
  });

  it("fails when mustNotMatch matches", () => {
    const r = checkOutputRegex("contains secret data", undefined, [/secret/]);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("forbidden pattern");
  });

  it("passes when mustNotMatch does not match", () => {
    const r = checkOutputRegex("safe output", undefined, [/secret/]);
    expect(r.passed).toBe(true);
  });

  it("checks all mustMatch patterns", () => {
    const r = checkOutputRegex("hello", [/hello/, /world/]);
    expect(r.passed).toBe(false);
  });
});

describe("checkOutputBlacklist", () => {
  it("fails when blacklisted term present", () => {
    const r = checkOutputBlacklist("this contains BadWord inside", ["badword"]);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("badword");
  });

  it("passes when no blacklisted terms", () => {
    const r = checkOutputBlacklist("clean text", ["forbidden", "banned"]);
    expect(r.passed).toBe(true);
  });

  it("is case-insensitive", () => {
    const r = checkOutputBlacklist("FORBIDDEN content", ["forbidden"]);
    expect(r.passed).toBe(false);
  });
});

describe("applyAgentGuardPolicy", () => {
  it("passes with minimal policy and valid output", () => {
    const r = applyAgentGuardPolicy("hello", {});
    expect(r.passed).toBe(true);
    expect(r.checks.length).toBeGreaterThanOrEqual(1);
  });

  it("fails basic on empty output", () => {
    const r = applyAgentGuardPolicy("", {});
    expect(r.passed).toBe(false);
  });

  it("checks JSON when expect_json is true", () => {
    const valid = applyAgentGuardPolicy('{"a":1}', { expect_json: true });
    expect(valid.passed).toBe(true);

    const invalid = applyAgentGuardPolicy("not json", { expect_json: true });
    expect(invalid.passed).toBe(false);
    expect(invalid.checks.find((c) => c.guard === "json_structure")?.passed).toBe(false);
  });

  it("checks size bounds", () => {
    const r = applyAgentGuardPolicy("hi", { min_output_chars: 10 });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.guard === "output_size")?.passed).toBe(false);
  });

  it("checks regex must_match", () => {
    const r = applyAgentGuardPolicy("hello", { must_match: ["world"] });
    expect(r.passed).toBe(false);
  });

  it("checks blacklist", () => {
    const r = applyAgentGuardPolicy("contains banned word", { blacklist: ["banned"] });
    expect(r.passed).toBe(false);
  });

  it("runs all guards and reports each", () => {
    const r = applyAgentGuardPolicy('{"valid":true}', {
      expect_json: true,
      min_output_chars: 1,
      max_output_chars: 1000,
      blacklist: ["evil"],
    });
    expect(r.passed).toBe(true);
    expect(r.checks.length).toBe(4);
  });
});

describe("determineOutputTrust", () => {
  it("returns stubbed for stubs", () => {
    expect(determineOutputTrust({ is_stub: true, has_tool_backing: false, guard_passed: true, has_error: false })).toBe("stubbed");
  });

  it("returns guard_failed on error", () => {
    expect(determineOutputTrust({ is_stub: false, has_tool_backing: false, guard_passed: true, has_error: true })).toBe("guard_failed");
  });

  it("returns guard_failed when guard fails", () => {
    expect(determineOutputTrust({ is_stub: false, has_tool_backing: false, guard_passed: false, has_error: false })).toBe("guard_failed");
  });

  it("returns tool_backed when tool backing", () => {
    expect(determineOutputTrust({ is_stub: false, has_tool_backing: true, guard_passed: true, has_error: false })).toBe("tool_backed");
  });

  it("returns unverified for raw LLM output", () => {
    expect(determineOutputTrust({ is_stub: false, has_tool_backing: false, guard_passed: true, has_error: false })).toBe("unverified");
  });
});

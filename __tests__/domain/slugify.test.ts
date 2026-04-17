import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/domain/slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes accents", () => {
    expect(slugify("Évaluation Résultat")).toBe("evaluation-resultat");
  });

  it("strips special characters", () => {
    expect(slugify("agent@v2!test")).toBe("agent-v2-test");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("--test--")).toBe("test");
  });

  it("collapses consecutive separators", () => {
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

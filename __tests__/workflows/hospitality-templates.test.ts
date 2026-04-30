/**
 * Tests — workflow templates hospitality (2 templates valident validateGraph).
 */
import { describe, it, expect } from "vitest";
import { validateGraph } from "@/lib/workflows/validate";
import {
  WORKFLOW_TEMPLATES,
  getTemplateById,
  getTemplatesByVertical,
} from "@/lib/workflows/templates";

describe("hospitality workflow templates", () => {
  it("guest-arrival-prep est valide via validateGraph", () => {
    const tpl = getTemplateById("hospitality-guest-arrival-prep");
    expect(tpl).toBeDefined();
    const graph = tpl!.build();
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("service-request-dispatch est valide via validateGraph", () => {
    const tpl = getTemplateById("hospitality-service-request-dispatch");
    expect(tpl).toBeDefined();
    const graph = tpl!.build();
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("getTemplatesByVertical('hospitality') retourne les 2 templates", () => {
    const out = getTemplatesByVertical("hospitality");
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.id).sort()).toEqual(
      [
        "hospitality-guest-arrival-prep",
        "hospitality-service-request-dispatch",
      ].sort(),
    );
  });

  it("WORKFLOW_TEMPLATES inclut les templates hospitality au catalog", () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("hospitality-guest-arrival-prep");
    expect(ids).toContain("hospitality-service-request-dispatch");
  });

  it("guest-arrival-prep contient bien un node approval + start cron", () => {
    const graph = getTemplateById("hospitality-guest-arrival-prep")!.build();
    const kinds = graph.nodes.map((n) => n.kind);
    expect(kinds).toContain("approval");
    expect(graph.nodes.find((n) => n.id === graph.startNodeId)?.kind).toBe(
      "trigger",
    );
  });

  it("service-request-dispatch branche urgent/normal via condition", () => {
    const graph = getTemplateById(
      "hospitality-service-request-dispatch",
    )!.build();
    const cond = graph.nodes.find((n) => n.kind === "condition");
    expect(cond).toBeDefined();
    const branches = graph.edges.filter((e) => e.source === cond!.id);
    expect(branches.length).toBeGreaterThanOrEqual(2);
    const conditions = branches.map((b) => b.condition).sort();
    expect(conditions).toContain("true");
    expect(conditions).toContain("false");
  });
});

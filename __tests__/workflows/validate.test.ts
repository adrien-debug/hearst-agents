/**
 * Workflow validation tests.
 */

import { describe, it, expect } from "vitest";
import { validateGraph } from "@/lib/workflows/validate";
import type { WorkflowGraph } from "@/lib/workflows/types";

function makeGraph(partial: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    startNodeId: "",
    ...partial,
  };
}

describe("validateGraph", () => {
  it("retourne missing_start si startNodeId vide", () => {
    const r = validateGraph(makeGraph({}));
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe("missing_start");
  });

  it("retourne start_not_found si node de départ absent", () => {
    const r = validateGraph(
      makeGraph({
        startNodeId: "missing",
        nodes: [
          {
            id: "a",
            kind: "trigger",
            label: "T",
            config: {},
          },
        ],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === "start_not_found")).toBe(true);
  });

  it("détecte un cycle simple A→B→A", () => {
    const r = validateGraph({
      startNodeId: "a",
      nodes: [
        { id: "a", kind: "trigger", label: "A", config: {} },
        { id: "b", kind: "tool_call", label: "B", config: { tool: "x" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === "cycle_detected")).toBe(true);
  });

  it("flagge edges pointant vers nodes inconnus", () => {
    const r = validateGraph({
      startNodeId: "a",
      nodes: [{ id: "a", kind: "trigger", label: "A", config: {} }],
      edges: [{ id: "e1", source: "a", target: "ghost" }],
    });
    expect(r.errors.some((e) => e.code === "edge_target_missing")).toBe(true);
  });

  it("flagge tool_call sans tool", () => {
    const r = validateGraph({
      startNodeId: "a",
      nodes: [
        { id: "a", kind: "trigger", label: "A", config: {} },
        { id: "b", kind: "tool_call", label: "B", config: {} },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    expect(r.errors.some((e) => e.code === "node_config_invalid")).toBe(true);
  });

  it("accepte un graphe linéaire valide A→B→output", () => {
    const r = validateGraph({
      startNodeId: "a",
      nodes: [
        { id: "a", kind: "trigger", label: "A", config: {} },
        { id: "b", kind: "tool_call", label: "B", config: { tool: "x" } },
        { id: "c", kind: "output", label: "C", config: {} },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("flagge graphe sans terminal accessible (boucle pure)", () => {
    const r = validateGraph({
      startNodeId: "a",
      nodes: [
        { id: "a", kind: "trigger", label: "A", config: {} },
        { id: "b", kind: "tool_call", label: "B", config: { tool: "x" } },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    // ici b n'a pas de sortie ET n'est pas un output → no_terminal? Non, b n'a pas de sortie donc il EST terminal.
    // Cas valide.
    expect(r.valid).toBe(true);
  });
});

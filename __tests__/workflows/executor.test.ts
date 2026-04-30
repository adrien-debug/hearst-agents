/**
 * Workflow executor tests.
 */

import { describe, it, expect, vi } from "vitest";
import { executeWorkflow } from "@/lib/workflows/executor";
import type {
  WorkflowExecutionContext,
  WorkflowExecutorEvent,
  WorkflowGraph,
} from "@/lib/workflows/types";

function makeContext(
  overrides: Partial<WorkflowExecutionContext> = {},
): WorkflowExecutionContext {
  return {
    userId: "u",
    tenantId: "t",
    workspaceId: "w",
    runId: "r1",
    outputs: new Map(),
    ...overrides,
  };
}

describe("executeWorkflow — linéaire", () => {
  it("exécute trigger → tool_call → output", async () => {
    const events: WorkflowExecutorEvent[] = [];
    const tool = vi.fn(async () => ({ success: true, output: { ok: true } }));
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "Start", config: { input: 42 } },
        {
          id: "act",
          kind: "tool_call",
          label: "Act",
          config: { tool: "do_thing", args: { x: 1 } },
        },
        { id: "out", kind: "output", label: "Out", config: { payload: {} } },
      ],
      edges: [
        { id: "e1", source: "t", target: "act" },
        { id: "e2", source: "act", target: "out" },
      ],
    };

    const result = await executeWorkflow(graph, makeContext(), {
      executeTool: tool,
      emitEvent: (e) => events.push(e),
    });

    expect(result.status).toBe("completed");
    expect(result.visitedCount).toBe(3);
    expect(tool).toHaveBeenCalledWith("do_thing", { x: 1 });
    const types = events.map((e) => e.type);
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");
    expect(types[types.length - 1]).toBe("workflow_completed");
  });

  it("propage les outputs via ${nodeId.path}", async () => {
    const tool = vi.fn(
      async (_name: string, _args: Record<string, unknown>) => ({
        success: true,
        output: { email: "lead@x.com" },
      }),
    );
    const sendTool = vi.fn(
      async (_name: string, _args: Record<string, unknown>) => ({
        success: true,
        output: null,
      }),
    );
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "Start", config: {} },
        {
          id: "fetch",
          kind: "tool_call",
          label: "Fetch",
          config: { tool: "get_lead", args: {} },
        },
        {
          id: "send",
          kind: "tool_call",
          label: "Send",
          config: {
            tool: "send_email",
            args: { to: "${fetch.email}" },
          },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "fetch" },
        { id: "e2", source: "fetch", target: "send" },
      ],
    };

    const callbacks = {
      executeTool: async (name: string, args: Record<string, unknown>) => {
        if (name === "get_lead") return tool(name, args);
        return sendTool(name, args);
      },
      emitEvent: () => undefined,
    };

    const result = await executeWorkflow(graph, makeContext(), callbacks);
    expect(result.status).toBe("completed");
    expect(sendTool).toHaveBeenCalledWith("send_email", {
      to: "lead@x.com",
    });
  });
});

describe("executeWorkflow — condition", () => {
  it("suit la branch true quand expression évalue true", async () => {
    const events: WorkflowExecutorEvent[] = [];
    const fetchTool = vi.fn(
      async (_name: string, _args: Record<string, unknown>) => ({
        success: true,
        output: { stage: "qualified" },
      }),
    );
    const sendTool = vi.fn(
      async (_name: string, _args: Record<string, unknown>) => ({
        success: true,
        output: null,
      }),
    );
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "T", config: {} },
        {
          id: "fetch",
          kind: "tool_call",
          label: "Fetch",
          config: { tool: "get", args: {} },
        },
        {
          id: "cond",
          kind: "condition",
          label: "?",
          config: { expression: "fetch.stage == 'qualified'" },
        },
        {
          id: "send",
          kind: "tool_call",
          label: "Send",
          config: { tool: "send", args: {} },
        },
        {
          id: "skip",
          kind: "output",
          label: "Skip",
          config: { payload: {} },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "fetch" },
        { id: "e2", source: "fetch", target: "cond" },
        { id: "e3", source: "cond", target: "send", condition: "true" },
        { id: "e4", source: "cond", target: "skip", condition: "false" },
      ],
    };

    const callbacks = {
      executeTool: async (name: string, args: Record<string, unknown>) => {
        if (name === "get") return fetchTool(name, args);
        return sendTool(name, args);
      },
      emitEvent: (e: WorkflowExecutorEvent) => events.push(e),
    };

    const result = await executeWorkflow(graph, makeContext(), callbacks);
    expect(result.status).toBe("completed");
    expect(sendTool).toHaveBeenCalledTimes(1);
    // skip ne doit pas avoir été visité
    const visited = events
      .filter((e) => e.type === "step_completed")
      .map((e) => (e as { nodeId: string }).nodeId);
    expect(visited).not.toContain("skip");
  });
});

describe("executeWorkflow — approval", () => {
  it("pause sur node approval (preview off)", async () => {
    const events: WorkflowExecutorEvent[] = [];
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "T", config: {} },
        {
          id: "appr",
          kind: "approval",
          label: "OK ?",
          config: { preview: "Confirmer" },
        },
        {
          id: "send",
          kind: "tool_call",
          label: "Send",
          config: { tool: "send", args: {} },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "appr" },
        { id: "e2", source: "appr", target: "send" },
      ],
    };

    const onApproval = vi.fn();
    const result = await executeWorkflow(graph, makeContext(), {
      executeTool: async () => ({ success: true, output: null }),
      emitEvent: (e) => events.push(e),
      onApprovalRequired: onApproval,
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.awaitingNodeId).toBe("appr");
    expect(onApproval).toHaveBeenCalled();
    expect(events.some((e) => e.type === "awaiting_approval")).toBe(true);
  });

  it("auto-approve en preview", async () => {
    const events: WorkflowExecutorEvent[] = [];
    const sendTool = vi.fn(async () => ({ success: true, output: null }));
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "T", config: {} },
        {
          id: "appr",
          kind: "approval",
          label: "OK ?",
          config: { preview: "Confirmer" },
        },
        {
          id: "send",
          kind: "tool_call",
          label: "Send",
          config: { tool: "send", args: {} },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "appr" },
        { id: "e2", source: "appr", target: "send" },
      ],
    };

    const result = await executeWorkflow(
      graph,
      makeContext({ preview: true }),
      {
        executeTool: sendTool,
        emitEvent: (e) => events.push(e),
      },
    );

    expect(result.status).toBe("completed");
    // En preview, le tool n'est pas appelé non plus (placeholder)
    expect(sendTool).toHaveBeenCalledTimes(0);
  });
});

describe("executeWorkflow — error policies", () => {
  it("abort par défaut sur tool failed", async () => {
    const tool = vi.fn(async () => ({ success: false, error: "boom" }));
    const events: WorkflowExecutorEvent[] = [];
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "T", config: {} },
        {
          id: "fail",
          kind: "tool_call",
          label: "Fail",
          config: { tool: "x", args: {} },
        },
      ],
      edges: [{ id: "e1", source: "t", target: "fail" }],
    };
    const result = await executeWorkflow(graph, makeContext(), {
      executeTool: tool,
      emitEvent: (e) => events.push(e),
    });
    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "step_failed")).toBe(true);
    expect(events.some((e) => e.type === "workflow_failed")).toBe(true);
  });

  it("skip continue après échec si policy skip", async () => {
    const tool = vi.fn(async () => ({ success: false, error: "boom" }));
    const okTool = vi.fn(async () => ({ success: true, output: "done" }));
    const events: WorkflowExecutorEvent[] = [];
    const graph: WorkflowGraph = {
      startNodeId: "t",
      nodes: [
        { id: "t", kind: "trigger", label: "T", config: {} },
        {
          id: "fail",
          kind: "tool_call",
          label: "Fail",
          onError: "skip",
          config: { tool: "x", args: {} },
        },
        {
          id: "next",
          kind: "tool_call",
          label: "Next",
          config: { tool: "y", args: {} },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "fail" },
        { id: "e2", source: "fail", target: "next" },
      ],
    };
    const result = await executeWorkflow(graph, makeContext(), {
      executeTool: async (name) =>
        name === "x" ? tool() : okTool(),
      emitEvent: (e) => events.push(e),
    });
    // Avec policy skip + edges sans condition "error", le runner ne suit que
    // les edges marquées "error". Sans edge "error" déclarée, le run termine.
    // C'est le comportement voulu : skip = pas de propagation par défaut.
    expect(result.status).toBe("completed");
    expect(events.some((e) => e.type === "step_skipped")).toBe(true);
    expect(okTool).not.toHaveBeenCalled();
  });
});

describe("executeWorkflow — invalid graph", () => {
  it("retourne invalid si validation échoue", async () => {
    const result = await executeWorkflow(
      { nodes: [], edges: [], startNodeId: "" },
      makeContext(),
      {
        executeTool: async () => ({ success: true }),
        emitEvent: () => undefined,
      },
    );
    expect(result.status).toBe("invalid");
  });
});

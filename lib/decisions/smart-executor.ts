/**
 * Smart Executor — runtime integration for intelligent tool selection.
 *
 * Wraps executeTool with:
 *   - optional tool selector injection
 *   - automatic fallback if primary tool fails
 *   - selection traced in run events
 *
 * Designed for opt-in use. Standard executeTool still works without this.
 */

import type { ToolDef, ToolGovernance, ToolResult } from "../engine/runtime/tool-executor";
import { executeTool } from "../engine/runtime/tool-executor";
import { RunTracer } from "../engine/runtime/tracer";
import type { ToolScore } from "../analytics/tool-ranking";
import { selectTool, buildFallbackChain, type SelectionGoal } from "./tool-selector";

export interface SmartExecOptions {
  tools: { tool: ToolDef; governance: ToolGovernance }[];
  scores: ToolScore[];
  input: Record<string, unknown>;
  tracer: RunTracer;
  goal?: SelectionGoal;
  category?: string;
  maxFallbacks?: number;
}

export interface SmartExecResult {
  result: ToolResult;
  selected_tool: string;
  attempted: string[];
  fallback_used: boolean;
  selection_reason: string;
}

export async function executeToolWithFallback(
  opts: SmartExecOptions,
): Promise<SmartExecResult> {
  const selection = selectTool({
    candidates: opts.scores,
    goal: opts.goal,
    category: opts.category,
  });

  if (!selection.selected) {
    return {
      result: {
        success: false,
        status: 0,
        data: null,
        latency_ms: 0,
        error: `No suitable tool: ${selection.reason}`,
      },
      selected_tool: "",
      attempted: [],
      fallback_used: false,
      selection_reason: selection.reason,
    };
  }

  const chain = [selection.selected, ...buildFallbackChain(opts.scores, selection.selected, opts.maxFallbacks ?? 2)];
  const attempted: string[] = [];

  for (const toolName of chain) {
    const entry = opts.tools.find((t) => `tool:${t.tool.name}` === toolName || t.tool.name === toolName);
    if (!entry) continue;

    attempted.push(toolName);

    try {
      const result = await executeTool(entry.tool, opts.input, opts.tracer, entry.governance);

      if (result.success) {
        return {
          result,
          selected_tool: toolName,
          attempted,
          fallback_used: attempted.length > 1,
          selection_reason: selection.reason,
        };
      }
    } catch {
      // Try next in chain
    }
  }

  return {
    result: {
      success: false,
      status: 0,
      data: null,
      latency_ms: 0,
      error: `All tools in fallback chain failed: ${attempted.join(" → ")}`,
    },
    selected_tool: attempted[0] ?? "",
    attempted,
    fallback_used: attempted.length > 1,
    selection_reason: selection.reason,
  };
}

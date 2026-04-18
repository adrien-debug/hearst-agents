import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import type { ChatMessage } from "../llm/types";
import type { ModelGoal } from "../decisions/model-selector";
import { getProvider } from "../llm/router";
import { smartChat } from "../llm/router";
import { RunTracer } from "./tracer";
import { executeTool, type ToolDef } from "./tool-executor";
import { RuntimeError, DEFAULT_RETRY } from "./lifecycle";
import { computeToolMetrics, scoreTools } from "../analytics";
import { selectTool } from "../decisions/tool-selector";

type DB = SupabaseClient<Database>;

interface StepRow {
  id: string;
  step_order: number;
  action_type: string;
  config: Record<string, unknown>;
  agents: {
    id: string;
    name: string;
    model_provider: string;
    model_name: string;
    system_prompt: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
  } | null;
}

interface WorkflowContext {
  input: Record<string, unknown>;
  steps: Record<string, unknown>;
  current: unknown;
}

export interface WorkflowExecOptions {
  cost_budget_usd?: number;
  smart_tool_selection?: boolean;
  smart_model_routing?: boolean;
  model_goal?: ModelGoal;
}

export async function executeWorkflow(
  sb: DB,
  workflowId: string,
  input: Record<string, unknown>,
  opts?: WorkflowExecOptions,
): Promise<{ run_id: string; workflow_version_id: string | null; output: unknown; status: "completed" | "failed"; error?: string }> {
  const { data: workflow } = await sb
    .from("workflows")
    .select("active_version_id")
    .eq("id", workflowId)
    .single();

  const workflowVersionId = workflow?.active_version_id ?? null;

  const tracer = new RunTracer(sb);
  const runId = await tracer.startRun({
    kind: "workflow",
    workflow_id: workflowId,
    workflow_version_id: workflowVersionId ?? undefined,
    input,
    cost_budget_usd: opts?.cost_budget_usd,
  });

  let steps: unknown[];

  if (workflowVersionId) {
    const { data: version } = await sb
      .from("workflow_versions")
      .select("steps_snapshot")
      .eq("id", workflowVersionId)
      .single();

    if (version?.steps_snapshot && Array.isArray(version.steps_snapshot)) {
      const snapshotSteps = version.steps_snapshot as unknown as Array<{
        id: string; step_order: number; action_type: string;
        config: Record<string, unknown>; agent_id: string | null;
      }>;

      const enrichedSteps = [];
      for (const snap of snapshotSteps) {
        let agents = null;
        if (snap.agent_id) {
          const { data: agent } = await sb
            .from("agents")
            .select("id, name, model_provider, model_name, system_prompt, temperature, max_tokens, top_p")
            .eq("id", snap.agent_id)
            .single();
          agents = agent;
        }
        enrichedSteps.push({ ...snap, agents });
      }
      steps = enrichedSteps;
    } else {
      steps = [];
    }
  } else {
    const { data: liveSteps } = await sb
      .from("workflow_steps")
      .select("id, step_order, action_type, config, agents(id, name, model_provider, model_name, system_prompt, temperature, max_tokens, top_p)")
      .eq("workflow_id", workflowId)
      .order("step_order", { ascending: true });
    steps = liveSteps ?? [];
  }

  if (steps.length === 0) {
    await tracer.endRun("failed", {}, "No steps in workflow");
    return { run_id: runId, workflow_version_id: workflowVersionId, output: null, status: "failed", error: "No steps" };
  }

  const ctx: WorkflowContext = {
    input,
    steps: {},
    current: input,
  };

  const smartSelection = opts?.smart_tool_selection ?? false;
  const smartModel = opts?.smart_model_routing ?? false;
  const modelGoal = opts?.model_goal ?? "balanced";

  try {
    for (const step of steps as unknown as StepRow[]) {
      const stepResult = await executeStep(sb, step, ctx, tracer, smartSelection, smartModel, modelGoal);
      ctx.steps[`step_${step.step_order}`] = stepResult;
      ctx.current = stepResult;
    }

    await tracer.endRun("completed", { output: ctx.current as Record<string, Json> });
    return { run_id: runId, workflow_version_id: workflowVersionId, output: ctx.current, status: "completed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof RuntimeError && e.code === "COST_LIMIT_EXCEEDED" ? "failed" : "failed";
    await tracer.endRun(status, {}, msg);
    return { run_id: runId, workflow_version_id: workflowVersionId, output: null, status: "failed", error: msg };
  }
}

async function executeStep(
  sb: DB,
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
  smartSelection = false,
  smartModel = false,
  modelGoal: ModelGoal = "balanced",
): Promise<unknown> {
  switch (step.action_type) {
    case "chat":
      return smartModel
        ? executeSmartChat(sb, step, ctx, tracer, modelGoal)
        : executeChat(step, ctx, tracer);

    case "tool_call":
      return executeToolStep(sb, step, ctx, tracer, smartSelection);

    case "condition":
      return executeCondition(sb, step, ctx, tracer);

    case "loop":
      return executeLoop(sb, step, ctx, tracer);

    case "transform":
      return executeTransform(step, ctx, tracer);

    default:
      throw new Error(`Unknown step type: ${step.action_type}`);
  }
}

async function executeChat(
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
): Promise<string> {
  if (!step.agents) throw new Error(`Step ${step.step_order}: no agent assigned`);
  const agent = step.agents;

  const result = await tracer.trace({
    kind: "llm_call",
    step_index: step.step_order,
    name: `step_${step.step_order}:${agent.name}`,
    input: { agent_id: agent.id, context_length: JSON.stringify(ctx.current).length },
    fn: async () => {
      const provider = getProvider(agent.model_provider);
      const messages: ChatMessage[] = [
        { role: "system", content: agent.system_prompt },
        { role: "user", content: typeof ctx.current === "string" ? ctx.current : JSON.stringify(ctx.current) },
      ];

      const res = await provider.chat({
        model: agent.model_name,
        messages,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        top_p: agent.top_p,
      });

      return {
        output: { content: res.content } as Record<string, Json>,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        cost_usd: res.cost_usd,
        model_used: `${agent.model_provider}/${agent.model_name}`,
      };
    },
  });

  return (result.output as Record<string, string>).content ?? "";
}

async function executeSmartChat(
  sb: DB,
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
  goal: ModelGoal,
): Promise<string> {
  if (!step.agents) throw new Error(`Step ${step.step_order}: no agent assigned`);
  const agent = step.agents;

  const messages: ChatMessage[] = [
    { role: "system", content: agent.system_prompt },
    { role: "user", content: typeof ctx.current === "string" ? ctx.current : JSON.stringify(ctx.current) },
  ];

  const response = await smartChat(sb, {
    goal,
    agent_provider: agent.model_provider,
    agent_model: agent.model_name,
    messages,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    top_p: agent.top_p,
    tracer,
  });

  await tracer.trace({
    kind: "llm_call",
    step_index: step.step_order,
    name: `step_${step.step_order}:${agent.name}:smart`,
    input: {
      agent_id: agent.id,
      context_length: JSON.stringify(ctx.current).length,
      smart_routing: true,
      goal,
      was_overridden: response.decision.was_overridden,
      selected: `${response.decision.selected_provider}/${response.decision.selected_model}`,
    },
    fn: async () => ({
      output: { content: response.content } as Record<string, Json>,
      tokens_in: response.tokens_in,
      tokens_out: response.tokens_out,
      cost_usd: response.cost_usd,
      model_used: `${response.decision.selected_provider}/${response.decision.selected_model}`,
    }),
  });

  return response.content;
}

async function executeToolStep(
  sb: DB,
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
  smartSelection = false,
): Promise<unknown> {
  const config = step.config ?? {};
  const toolId = config.tool_id as string | undefined;

  if (!toolId) throw new Error(`Step ${step.step_order}: tool_call requires config.tool_id`);

  const { data: toolRow } = await sb
    .from("tools")
    .select("id, name, endpoint_url, http_method, input_schema, output_schema, auth_type, auth_config, timeout_ms, risk_level, retry_policy, rate_limit, requires_sandbox, kill_switch, enabled")
    .eq("id", toolId)
    .single();

  if (!toolRow) throw new Error(`Tool ${toolId} not found`);

  const tool: ToolDef = {
    ...toolRow,
    retry_policy: (toolRow.retry_policy as unknown as ToolDef["retry_policy"]) ?? DEFAULT_RETRY,
    rate_limit: (toolRow.rate_limit as unknown as ToolDef["rate_limit"]) ?? { max_calls_per_minute: 60, max_calls_per_run: 100 },
  };

  const toolInput = typeof ctx.current === "object" && ctx.current !== null
    ? (ctx.current as Record<string, unknown>)
    : { input: ctx.current };

  const result = await executeTool(tool, toolInput, tracer);

  if (!result.success && smartSelection) {
    const fallbackResult = await trySmartFallback(sb, tool.name, toolInput, tracer);
    if (fallbackResult) return fallbackResult;
  }

  if (!result.success) {
    throw new Error(`Tool ${tool.name} failed: ${result.error ?? `HTTP ${result.status}`}`);
  }

  return result.data;
}

async function trySmartFallback(
  sb: DB,
  failedToolName: string,
  input: Record<string, unknown>,
  tracer: RunTracer,
): Promise<unknown | null> {
  try {
    const metrics = await computeToolMetrics(sb, { days: 7 });
    if (metrics.length < 2) return null;

    const scores = scoreTools(metrics);
    const selection = selectTool({
      candidates: scores,
      exclude: [`tool:${failedToolName}`, failedToolName],
      goal: "reliability",
    });

    if (!selection.selected) return null;

    const fallbackName = selection.selected.replace(/^tool:/, "");
    const { data: fallbackRow } = await sb
      .from("tools")
      .select("id, name, endpoint_url, http_method, input_schema, output_schema, auth_type, auth_config, timeout_ms, risk_level, retry_policy, rate_limit, requires_sandbox, kill_switch, enabled")
      .eq("name", fallbackName)
      .single();

    if (!fallbackRow) return null;

    const fallbackTool: ToolDef = {
      ...fallbackRow,
      retry_policy: (fallbackRow.retry_policy as unknown as ToolDef["retry_policy"]) ?? DEFAULT_RETRY,
      rate_limit: (fallbackRow.rate_limit as unknown as ToolDef["rate_limit"]) ?? { max_calls_per_minute: 60, max_calls_per_run: 100 },
    };

    const fallbackResult = await executeTool(fallbackTool, input, tracer);
    if (fallbackResult.success) return fallbackResult.data;
  } catch {
    // Fallback failed silently — original error will be thrown
  }

  return null;
}

async function executeCondition(
  sb: DB,
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
): Promise<unknown> {
  const config = step.config ?? {};
  const field = config.field as string | undefined;
  const operator = (config.operator as string) ?? "equals";
  const value = config.value;

  const current = ctx.current as Record<string, unknown> | null;
  const actual = field && current ? current[field] : ctx.current;

  let conditionMet = false;
  switch (operator) {
    case "equals": conditionMet = actual === value; break;
    case "not_equals": conditionMet = actual !== value; break;
    case "contains": conditionMet = String(actual).includes(String(value)); break;
    case "gt": conditionMet = Number(actual) > Number(value); break;
    case "lt": conditionMet = Number(actual) < Number(value); break;
    case "truthy": conditionMet = !!actual; break;
    case "falsy": conditionMet = !actual; break;
    default: conditionMet = !!actual;
  }

  await tracer.trace({
    kind: "condition_eval",
    step_index: step.step_order,
    name: `condition:${field ?? "current"}`,
    input: { field, operator, value, actual } as Record<string, Json>,
    fn: async () => ({
      output: { condition_met: conditionMet } as Record<string, Json>,
    }),
  });

  if (!conditionMet) {
    const skipValue = config.else_value ?? null;
    return skipValue;
  }

  return ctx.current;
}

async function executeLoop(
  sb: DB,
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
): Promise<unknown[]> {
  const config = step.config ?? {};
  const maxIterations = (config.max_iterations as number) ?? 10;

  const items = Array.isArray(ctx.current) ? ctx.current : [ctx.current];
  const results: unknown[] = [];

  for (let i = 0; i < Math.min(items.length, maxIterations); i++) {
    const iterCtx: WorkflowContext = { ...ctx, current: items[i] };

    if (step.agents) {
      const result = await executeChat(step, iterCtx, tracer);
      results.push(result);
    } else {
      results.push(items[i]);
    }
  }

  return results;
}

async function executeTransform(
  step: StepRow,
  ctx: WorkflowContext,
  tracer: RunTracer,
): Promise<unknown> {
  const config = step.config ?? {};
  const operation = (config.operation as string) ?? "passthrough";

  let result: unknown = ctx.current;

  switch (operation) {
    case "extract_field": {
      const field = config.field as string;
      if (field && typeof ctx.current === "object" && ctx.current) {
        result = (ctx.current as Record<string, unknown>)[field];
      }
      break;
    }
    case "to_json": {
      result = typeof ctx.current === "string" ? JSON.parse(ctx.current) : ctx.current;
      break;
    }
    case "to_string": {
      result = typeof ctx.current === "string" ? ctx.current : JSON.stringify(ctx.current);
      break;
    }
    case "merge": {
      const mergeWith = config.merge_with as Record<string, unknown> | undefined;
      result = { ...(ctx.current as Record<string, unknown>), ...mergeWith };
      break;
    }
    case "collect": {
      result = { ...ctx.steps };
      break;
    }
    case "template": {
      const tpl = config.template as string | undefined;
      if (tpl) {
        const maxChars = (config.max_chars as number) ?? 80000;
        const stepsStr = truncateJson(ctx.steps, maxChars);
        result = tpl.replace(/\{\{steps\}\}/g, stepsStr)
          .replace(/\{\{input\}\}/g, JSON.stringify(ctx.input, null, 2));
      }
      break;
    }
    default:
      break;
  }

  await tracer.trace({
    kind: "custom",
    step_index: step.step_order,
    name: `transform:${operation}`,
    input: { operation } as Record<string, Json>,
    fn: async () => ({
      output: { result_type: typeof result } as Record<string, Json>,
    }),
  });

  return result;
}

function truncateJson(data: unknown, maxChars: number): string {
  const full = JSON.stringify(data, null, 2);
  if (full.length <= maxChars) return full;

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const parts: string[] = [];
    let totalLen = 0;
    for (const [key, val] of Object.entries(obj)) {
      const valStr = JSON.stringify(val, null, 2);
      const entryLen = key.length + valStr.length + 10;
      if (totalLen + entryLen > maxChars) {
        parts.push(`"${key}": "[truncated — ${valStr.length} chars]"`);
      } else {
        parts.push(`"${key}": ${valStr}`);
        totalLen += entryLen;
      }
    }
    return `{\n${parts.join(",\n")}\n}`;
  }

  return full.slice(0, maxChars) + "\n... [truncated]";
}

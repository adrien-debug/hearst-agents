import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { RunTracer } from "./tracer";
import {
  RuntimeError,
  withRetry,
  type RetryPolicy,
  DEFAULT_RETRY,
  DEFAULT_TIMEOUTS,
} from "./lifecycle";

type DB = SupabaseClient<Database>;

export interface ToolDef {
  id: string;
  name: string;
  endpoint_url: string | null;
  http_method: string;
  input_schema: unknown;
  output_schema: unknown;
  auth_type: string;
  auth_config: unknown;
  timeout_ms: number;
  risk_level: string;
  retry_policy: RetryPolicy;
  rate_limit: { max_calls_per_minute: number; max_calls_per_run: number };
  requires_sandbox: boolean;
  kill_switch: boolean;
  enabled: boolean;
}

export interface ToolGovernance {
  enabled: boolean;
  timeout_override_ms: number | null;
  max_calls_per_run: number | null;
  risk_accepted: boolean;
}

export interface ToolResult {
  success: boolean;
  status: number;
  data: unknown;
  latency_ms: number;
  error?: string;
  retries?: number;
}

const runCallCounts = new Map<string, Map<string, number>>();

function checkGovernance(tool: ToolDef, governance?: ToolGovernance): void {
  if (tool.kill_switch) {
    throw new RuntimeError("TOOL_KILL_SWITCH", `Tool "${tool.name}" has kill switch enabled`);
  }
  if (!tool.enabled) {
    throw new RuntimeError("TOOL_DISABLED", `Tool "${tool.name}" is globally disabled`);
  }
  if (governance && !governance.enabled) {
    throw new RuntimeError("TOOL_DISABLED", `Tool "${tool.name}" is disabled for this agent`);
  }
  if (tool.risk_level === "critical" && (!governance || !governance.risk_accepted)) {
    throw new RuntimeError(
      "TOOL_RISK_NOT_ACCEPTED",
      `Tool "${tool.name}" has critical risk level — requires explicit risk acceptance`,
    );
  }
  if (tool.requires_sandbox) {
    throw new RuntimeError(
      "TOOL_SANDBOX_REQUIRED",
      `Tool "${tool.name}" requires sandbox execution (not yet supported)`,
    );
  }
}

function checkRateLimit(tool: ToolDef, runId: string, governance?: ToolGovernance): void {
  const maxPerRun = governance?.max_calls_per_run ?? tool.rate_limit.max_calls_per_run;
  if (!runCallCounts.has(runId)) runCallCounts.set(runId, new Map());
  const runMap = runCallCounts.get(runId)!;
  const current = runMap.get(tool.id) ?? 0;

  if (current >= maxPerRun) {
    throw new RuntimeError(
      "TOOL_RATE_LIMITED",
      `Tool "${tool.name}" exceeded max ${maxPerRun} calls per run`,
    );
  }
  runMap.set(tool.id, current + 1);
}

export function clearRunRateLimits(runId: string): void {
  runCallCounts.delete(runId);
}

export async function executeTool(
  tool: ToolDef,
  input: Record<string, unknown>,
  tracer?: RunTracer,
  governance?: ToolGovernance,
): Promise<ToolResult> {
  checkGovernance(tool, governance);

  if (tracer?.getRunId()) {
    checkRateLimit(tool, tracer.getRunId()!, governance);
  }

  if (!tool.endpoint_url) {
    return {
      success: false,
      status: 0,
      data: null,
      latency_ms: 0,
      error: `Tool "${tool.name}" has no endpoint_url configured`,
    };
  }

  const timeout = governance?.timeout_override_ms ?? tool.timeout_ms ?? DEFAULT_TIMEOUTS.tool_timeout_ms;
  const retryPolicy: RetryPolicy = {
    max_retries: tool.retry_policy?.max_retries ?? DEFAULT_RETRY.max_retries,
    backoff_ms: tool.retry_policy?.backoff_ms ?? DEFAULT_RETRY.backoff_ms,
    backoff_multiplier: tool.retry_policy?.backoff_multiplier ?? DEFAULT_RETRY.backoff_multiplier,
  };

  const doFetch = async (): Promise<{
    output: Record<string, Json>;
    success: boolean;
    status: number;
    data: unknown;
    latency_ms: number;
    error?: string;
  }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (tool.auth_type === "api_key") {
      const config = tool.auth_config as Record<string, string>;
      const headerName = config?.header ?? "Authorization";
      const prefix = config?.prefix ?? "Bearer ";
      const key = config?.key ?? "";
      if (key) headers[headerName] = `${prefix}${key}`;
    }

    const fetchOpts: RequestInit = {
      method: tool.http_method,
      headers,
      signal: controller.signal,
    };

    if (tool.http_method !== "GET" && tool.http_method !== "HEAD") {
      fetchOpts.body = JSON.stringify(input);
    }

    const start = Date.now();
    try {
      const res = await fetch(tool.endpoint_url!, fetchOpts);
      const latency = Date.now() - start;

      let data: unknown;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok && res.status >= 500) {
        throw new RuntimeError(
          "STEP_FAILED",
          `Tool "${tool.name}" returned HTTP ${res.status}`,
          true,
        );
      }

      return {
        output: { status: res.status, data } as Record<string, Json>,
        success: res.ok,
        status: res.status,
        data,
        latency_ms: latency,
      };
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      const errorMsg = e instanceof Error ? e.message : String(e);
      const isAbort = errorMsg.includes("abort");
      if (isAbort) {
        throw new RuntimeError("TIMEOUT", `Tool "${tool.name}" timed out after ${timeout}ms`);
      }
      throw new RuntimeError("STEP_FAILED", `Tool "${tool.name}": ${errorMsg}`, true);
    } finally {
      clearTimeout(timer);
    }
  };

  if (tracer) {
    const traceResult = await tracer.trace({
      kind: "tool_call",
      name: `tool:${tool.name}`,
      timeout_ms: timeout + 5000,
      input: { tool_id: tool.id, endpoint: tool.endpoint_url, method: tool.http_method },
      fn: async () => {
        const r = await withRetry(() => doFetch(), retryPolicy, `tool:${tool.name}`);
        return { output: r.output };
      },
    });
    const output = traceResult.output as Record<string, unknown>;
    return {
      success: !("error" in output),
      status: (output.status as number) ?? 200,
      data: output.data ?? output,
      latency_ms: traceResult.latency_ms,
    };
  }

  const raw = await withRetry(() => doFetch(), retryPolicy, `tool:${tool.name}`);
  return {
    success: raw.success,
    status: raw.status,
    data: raw.data,
    latency_ms: raw.latency_ms,
    error: raw.error,
  };
}

export async function loadAgentTools(
  sb: DB,
  agentId: string,
): Promise<{ tool: ToolDef; governance: ToolGovernance }[]> {
  const { data } = await sb
    .from("agent_tools")
    .select(`
      enabled, timeout_override_ms, max_calls_per_run, risk_accepted,
      tools(id, name, endpoint_url, http_method, input_schema, output_schema,
            auth_type, auth_config, timeout_ms, risk_level, retry_policy,
            rate_limit, requires_sandbox, kill_switch, enabled)
    `)
    .eq("agent_id", agentId);

  if (!data) return [];

  return data
    .map((row) => {
      const t = row.tools as unknown as ToolDef | null;
      if (!t) return null;
      return {
        tool: t,
        governance: {
          enabled: row.enabled,
          timeout_override_ms: row.timeout_override_ms,
          max_calls_per_run: row.max_calls_per_run,
          risk_accepted: row.risk_accepted,
        } as ToolGovernance,
      };
    })
    .filter((x): x is { tool: ToolDef; governance: ToolGovernance } => x !== null);
}

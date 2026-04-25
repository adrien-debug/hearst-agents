/**
 * Integration Executor — safe execution of integration actions.
 *
 * All external calls go through this executor which ensures:
 *   - Full tracing via RunTracer
 *   - Timeout enforcement
 *   - Retry with backoff
 *   - Credential resolution (never leaked)
 *   - Read-only enforcement for Phase 1
 *   - Connection health tracking
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import type { IntegrationAdapter, IntegrationCredentials, AdapterResult } from "./adapter";
import { RunTracer } from "../engine/runtime/tracer";
import { RuntimeError, withRetry, DEFAULT_RETRY, type RetryPolicy } from "../engine/runtime/lifecycle";
import { HttpAdapter } from "./http-adapter";
import { NotionAdapter } from "./notion-adapter";

type DB = SupabaseClient<Database>;

const ADAPTER_REGISTRY: Record<string, IntegrationAdapter> = {
  http: new HttpAdapter(),
  notion: new NotionAdapter(),
};

export function getAdapter(provider: string): IntegrationAdapter {
  const adapter = ADAPTER_REGISTRY[provider];
  if (!adapter) {
    throw new RuntimeError("INVALID_INPUT", `No adapter registered for provider: ${provider}`);
  }
  return adapter;
}

export function listAdapters(): { provider: string; actions: string[] }[] {
  return Object.entries(ADAPTER_REGISTRY).map(([provider, adapter]) => ({
    provider,
    actions: adapter.actions.map((a) => a.name),
  }));
}

export interface IntegrationExecOptions {
  connection_id: string;
  action: string;
  input: Record<string, unknown>;
  tracer?: RunTracer;
  timeout_ms?: number;
  retry_policy?: RetryPolicy;
}

export interface IntegrationExecResult {
  success: boolean;
  data: unknown;
  status: number;
  latency_ms: number;
  trace_id: string | null;
  error?: string;
}

export async function executeIntegration(
  sb: DB,
  opts: IntegrationExecOptions,
): Promise<IntegrationExecResult> {
  const { data: connection, error: connErr } = await sb
    .from("integration_connections")
    .select("*")
    .eq("id", opts.connection_id)
    .single();

  if (connErr || !connection) {
    throw new RuntimeError("INVALID_INPUT", `Integration connection ${opts.connection_id} not found`);
  }

  if (connection.status !== "active") {
    throw new RuntimeError("TOOL_DISABLED", `Integration "${connection.name}" is ${connection.status}`);
  }

  const adapter = getAdapter(connection.provider);

  const actionDef = adapter.actions.find((a) => a.name === opts.action);
  if (!actionDef) {
    throw new RuntimeError(
      "INVALID_INPUT",
      `Action "${opts.action}" not found on adapter "${connection.provider}". Available: ${adapter.actions.map((a) => a.name).join(", ")}`,
    );
  }

  if (!actionDef.readonly) {
    throw new RuntimeError(
      "TOOL_RISK_NOT_ACCEPTED",
      `Action "${opts.action}" is not read-only — blocked in Phase 1`,
    );
  }

  const credentials = connection.credentials as unknown as IntegrationCredentials;
  const retryPolicy = opts.retry_policy ?? { ...DEFAULT_RETRY, max_retries: 1 };

  const doExecute = async (): Promise<AdapterResult> => {
    const result = await adapter.execute(opts.action, opts.input, credentials, connection.config as Record<string, unknown>);
    if (!result.success && result.status >= 500) {
      throw new RuntimeError("STEP_FAILED", result.error ?? `Integration returned ${result.status}`, true);
    }
    return result;
  };

  if (opts.tracer) {
    const traceResult = await opts.tracer.trace({
      kind: "tool_call",
      name: `integration:${opts.action}`,
      timeout_ms: opts.timeout_ms ?? 30_000,
      input: {
        connection_id: opts.connection_id,
        provider: connection.provider,
        action: opts.action,
        input_keys: Object.keys(opts.input),
      },
      fn: async () => {
        const r = await withRetry(doExecute, retryPolicy, `integration:${opts.action}`);
        return {
          output: {
            success: r.success,
            status: r.status,
            data: r.data as Record<string, Json>,
          } as Record<string, Json>,
        };
      },
    });

    await updateConnectionHealth(sb, opts.connection_id, true);

    return {
      success: !("error" in traceResult.output),
      data: traceResult.output.data ?? traceResult.output,
      status: (traceResult.output.status as number) ?? 200,
      latency_ms: traceResult.latency_ms,
      trace_id: traceResult.trace_id,
    };
  }

  const raw = await withRetry(doExecute, retryPolicy, `integration:${opts.action}`);
  await updateConnectionHealth(sb, opts.connection_id, raw.success);

  return {
    success: raw.success,
    data: raw.data,
    status: raw.status,
    latency_ms: raw.latency_ms,
    trace_id: null,
    error: raw.error,
  };
}

async function updateConnectionHealth(sb: DB, connectionId: string, success: boolean) {
  await sb
    .from("integration_connections")
    .update({
      health: success ? "healthy" : "degraded",
      last_health_check: new Date().toISOString(),
    })
    .eq("id", connectionId);
}

export async function checkConnectionHealth(
  sb: DB,
  connectionId: string,
): Promise<{ healthy: boolean; latency_ms: number; error?: string }> {
  const { data: connection } = await sb
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (!connection) {
    return { healthy: false, latency_ms: 0, error: "Connection not found" };
  }

  const adapter = getAdapter(connection.provider);
  const credentials = connection.credentials as unknown as IntegrationCredentials;
  const result = await adapter.healthCheck(credentials);

  await sb
    .from("integration_connections")
    .update({
      health: result.healthy ? "healthy" : "down",
      last_health_check: new Date().toISOString(),
    })
    .eq("id", connectionId);

  return result;
}

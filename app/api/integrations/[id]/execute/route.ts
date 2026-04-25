import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, parseBody } from "@/lib/domain/api-helpers";
import { RunTracer } from "@/lib/engine/runtime";
import { executeIntegration } from "@/lib/integrations";
import { RuntimeError } from "@/lib/engine/runtime/lifecycle";
import { z } from "zod";

export const dynamic = "force-dynamic";

const executeSchema = z.object({
  action: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  agent_id: z.string().uuid().optional(),
  cost_budget_usd: z.number().positive().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const parsed = parseBody(executeSchema, body);
  if (!parsed.success) return parsed.response;

  const sb = requireServerSupabase();
  const tracer = new RunTracer(sb);

  try {
    const runId = await tracer.startRun({
      kind: "tool_test",
      trigger: "api",
      agent_id: parsed.data.agent_id ?? undefined,
      input: {
        connection_id: id,
        action: parsed.data.action,
        input_keys: Object.keys(parsed.data.input),
      },
      cost_budget_usd: parsed.data.cost_budget_usd,
    });

    const result = await executeIntegration(sb, {
      connection_id: id,
      action: parsed.data.action,
      input: parsed.data.input,
      tracer,
    });

    await tracer.endRun("completed", {
      success: result.success,
      status: result.status,
      latency_ms: result.latency_ms,
    });

    return ok({
      data: result.data,
      run_id: runId,
      trace_id: result.trace_id,
      success: result.success,
      status: result.status,
      latency_ms: result.latency_ms,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof RuntimeError ? e.code : "STEP_FAILED";
    console.error(`integration execute error connection=${id}:`, code, msg);
    await tracer.endRun("failed", {}, msg);
    return err(msg, e instanceof RuntimeError && e.code === "INVALID_INPUT" ? 400 : 500);
  }
}

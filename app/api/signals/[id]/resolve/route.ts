import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err, parseBody } from "@/lib/domain/api-helpers";
import { resolveSignal, acknowledgeSignal, trackChange } from "@/lib/decisions";
import { z } from "zod";

export const dynamic = "force-dynamic";

const resolveSchema = z.object({
  action: z.enum(["apply", "dismiss", "acknowledge"]),
  applied_by: z.string().optional(),
  resolution_note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const parsed = parseBody(resolveSchema, body);
  if (!parsed.success) return parsed.response;

  const sb = requireServerSupabase();

  if (parsed.data.action === "acknowledge") {
    const { error: dbErr } = await acknowledgeSignal(sb, id);
    if (dbErr) return err(dbErr.message, 500);
    return ok({ data: { status: "acknowledged" } });
  }

  const { data: signal } = await sb
    .from("improvement_signals")
    .select("*")
    .eq("id", id)
    .single();

  const status = parsed.data.action === "apply" ? "applied" as const : "dismissed" as const;
  const { error: dbErr } = await resolveSignal(sb, id, {
    status,
    applied_by: parsed.data.applied_by,
    resolution_note: parsed.data.resolution_note,
  });

  if (dbErr) return err(dbErr.message, 500);

  if (signal && status === "applied") {
    const changeType = signal.kind === "guard_policy" ? "guard_policy"
      : signal.kind === "cost_optimization" ? "cost_budget"
      : signal.kind === "tool_replacement" ? "tool_config"
      : "agent_config";

    await trackChange(sb, {
      signal_id: id,
      change_type: changeType as "guard_policy" | "cost_budget" | "model_switch" | "tool_config" | "agent_config" | "prompt_update",
      target_id: signal.target_id,
      target_type: signal.target_type as "agent" | "tool" | "integration" | "workflow" | "model_profile",
      before_value: {},
      after_value: { suggestion: signal.suggestion, data: signal.data },
      actor: parsed.data.applied_by ?? "operator",
      reason: parsed.data.resolution_note ?? `Applied signal: ${signal.title}`,
    });
  }

  return ok({ data: { status } });
}

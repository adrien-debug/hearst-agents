import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { replayRun } from "@/lib/runtime/replay";
import { RuntimeError } from "@/lib/runtime/lifecycle";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: {
    mode?: "live" | "stub";
    override_input?: Record<string, unknown>;
    cost_budget_usd?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  try {
    const sb = requireServerSupabase();
    const result = await replayRun(sb, {
      run_id: id,
      mode: body.mode,
      override_input: body.override_input,
      cost_budget_usd: body.cost_budget_usd,
    });

    if (result.status === "failed") {
      return err(result.error ?? "replay_failed", 500);
    }

    return ok(result);
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.error(`POST /api/runs/${id}/replay: ${e.code}`, e.message);
      const status = e.code === "REPLAY_SOURCE_NOT_FOUND" ? 404 : 400;
      return err(`${e.code}: ${e.message}`, status);
    }
    console.error(`POST /api/runs/${id}/replay: uncaught`, e);
    return err("internal_error", 500);
  }
}

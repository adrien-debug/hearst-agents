/**
 * @deprecated Legacy v1 runs endpoint (Supabase).
 * Use /api/v2/runs for the unified run history.
 */
import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, dbErr } from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type RunKindEnum = Database["public"]["Enums"]["run_kind"];
type RunStatusEnum = Database["public"]["Enums"]["run_status"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = requireServerSupabase();
    const agentId = req.nextUrl.searchParams.get("agent_id");
    const kind = req.nextUrl.searchParams.get("kind");
    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30"), 100);

    let query = sb
      .from("runs")
      .select("id, kind, status, agent_id, tokens_in, tokens_out, cost_usd, latency_ms, created_at, finished_at, error")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (agentId) query = query.eq("agent_id", agentId);
    if (kind) query = query.eq("kind", kind as RunKindEnum);
    if (status) query = query.eq("status", status as RunStatusEnum);

    const { data, error } = await query;
    if (error) return dbErr("GET /api/runs", error);
    return ok({ runs: data ?? [] });
  } catch (e) {
    console.error("GET /api/runs: uncaught", e);
    return err("internal_error", 500);
  }
}

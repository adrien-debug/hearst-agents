import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain/api-helpers";
import { computeAgentMetrics, generateAgentFeedback } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const agentId = req.nextUrl.searchParams.get("agent_id") ?? undefined;

  try {
    const metrics = await computeAgentMetrics(sb, { days, agent_id: agentId });
    const feedback = metrics.flatMap((m) => generateAgentFeedback(m));

    return ok({ data: { metrics, feedback } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("analytics/agents error:", msg);
    return err(msg, 500);
  }
}

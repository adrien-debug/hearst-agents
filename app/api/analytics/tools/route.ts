import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain/api-helpers";
import { computeToolMetrics, scoreTools, recommendTool, generateToolFeedback } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = requireServerSupabase();
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const toolName = req.nextUrl.searchParams.get("tool") ?? undefined;

  try {
    const metrics = await computeToolMetrics(sb, { days, tool_name: toolName });
    const scores = scoreTools(metrics);
    const recommendation = recommendTool(scores);
    const feedback = generateToolFeedback(scores);

    return ok({ data: { metrics, scores, recommendation, feedback } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("analytics/tools error:", msg);
    return err(msg, 500);
  }
}

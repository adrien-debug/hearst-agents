import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain/api-helpers";
import { computeToolMetrics, computeAgentMetrics, scoreTools, generateAgentFeedback, generateToolFeedback } from "@/lib/analytics";
import { persistSignals } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export async function POST() {
  const sb = requireServerSupabase();

  try {
    const [toolMetrics, agentMetrics] = await Promise.all([
      computeToolMetrics(sb, { days: 7 }),
      computeAgentMetrics(sb, { days: 7 }),
    ]);

    const toolScores = scoreTools(toolMetrics);
    const toolFeedback = generateToolFeedback(toolScores);
    const agentFeedback = agentMetrics.flatMap((m) => generateAgentFeedback(m));
    const allSignals = [...toolFeedback, ...agentFeedback];

    const result = await persistSignals(sb, allSignals);

    return ok({
      data: {
        signals_generated: allSignals.length,
        signals_created: result.created,
        signals_skipped: result.skipped_duplicates,
        tool_metrics_count: toolMetrics.length,
        agent_metrics_count: agentMetrics.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("analytics/generate error:", msg);
    return err(msg, 500);
  }
}

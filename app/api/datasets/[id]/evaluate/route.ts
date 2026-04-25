import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, parseBody } from "@/lib/domain";
import { getProvider } from "@/lib/llm";
import { RunTracer } from "@/lib/engine/runtime";
import type { ChatMessage } from "@/lib/llm";
import type { Json } from "@/lib/database.types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const batchEvalSchema = z.object({
  agent_id: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: datasetId } = await params;
  try {
    const body = await req.json();
    const parsed = parseBody(batchEvalSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const agentId = parsed.data.agent_id;

    const [agentRes, entriesRes] = await Promise.all([
      sb.from("agents").select("*").eq("id", agentId).single(),
      sb
        .from("dataset_entries")
        .select("id, input, expected_output")
        .eq("dataset_id", datasetId)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);

    if (agentRes.error || !agentRes.data) return err("agent_not_found", 404);
    const agent = agentRes.data;
    const entries = entriesRes.data ?? [];

    if (entries.length === 0) return err("dataset_empty", 400);

    const tracer = new RunTracer(sb);
    const runId = await tracer.startRun({
      kind: "evaluation",
      agent_id: agentId,
      input: { dataset_id: datasetId, entries_count: entries.length },
      cost_budget_usd: agent.cost_budget_per_run ?? undefined,
    });

    const provider = getProvider(agent.model_provider);
    let totalScore = 0;
    let passCount = 0;
    const results: { entry_id: string; passed: boolean; score: number; actual: string }[] = [];

    for (const entry of entries) {
      const messages: ChatMessage[] = [
        { role: "system", content: agent.system_prompt },
        { role: "user", content: entry.input },
      ];

      const traceResult = await tracer.trace({
        kind: "llm_call",
        name: `eval:${entry.id.slice(0, 8)}`,
        input: { entry_id: entry.id, input_length: entry.input.length },
        fn: async () => {
          const res = await provider.chat({
            model: agent.model_name,
            messages,
            temperature: 0,
            max_tokens: agent.max_tokens,
          });
          return {
            output: { content_length: res.content.length, content: res.content.slice(0, 500) } as Record<string, Json>,
            tokens_in: res.tokens_in,
            tokens_out: res.tokens_out,
            cost_usd: res.cost_usd,
            model_used: `${agent.model_provider}/${agent.model_name}`,
          };
        },
      });

      const actual = ((traceResult.output as Record<string, unknown>).content as string) ?? "";
      const passed = actual.toLowerCase().includes(entry.expected_output.toLowerCase());
      const score = passed ? 1.0 : 0.0;

      totalScore += score;
      if (passed) passCount++;

      await sb.from("evaluations").insert({
        agent_id: agentId,
        eval_type: "accuracy",
        score,
        max_score: 1.0,
        test_input: entry.input,
        expected_output: entry.expected_output,
        actual_output: actual,
        passed,
        run_id: runId,
        dataset_entry_id: entry.id,
      });

      results.push({ entry_id: entry.id, passed, score, actual: actual.slice(0, 200) });
    }

    const avgScore = entries.length > 0 ? totalScore / entries.length : 0;

    await tracer.endRun("completed", {
      avg_score: avgScore,
      pass_rate: passCount / entries.length,
      total_entries: entries.length,
      passed: passCount,
    });

    return ok({
      run_id: runId,
      dataset_id: datasetId,
      agent_id: agentId,
      total_entries: entries.length,
      passed: passCount,
      failed: entries.length - passCount,
      avg_score: Math.round(avgScore * 100) / 100,
      results,
    });
  } catch (e) {
    console.error(`POST /api/datasets/${datasetId}/evaluate: uncaught`, e);
    return err("internal_error", 500);
  }
}

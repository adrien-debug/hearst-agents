import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { getProvider } from "@/lib/llm";
import { evaluateSchema, ok, err, parseBody, dbErr } from "@/lib/domain";
import { requireScope } from "@/lib/platform/auth/scope";
import type { ChatMessage } from "@/lib/llm";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth gate : exécute des appels LLM eval — public = abus tokens.
  const { scope, error: scopeError } = await requireScope({
    context: `POST /api/agents/${id}/evaluate`,
  });
  if (scopeError || !scope) {
    return err(scopeError?.message ?? "not_authenticated", scopeError?.status ?? 401);
  }

  try {
    const body = await req.json();
    const parsed = parseBody(evaluateSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const { data: agent, error: agentErr } = await sb
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (agentErr || !agent) return err("agent_not_found", 404);

    const input = parsed.data;
    const messages: ChatMessage[] = [
      { role: "system", content: agent.system_prompt },
      { role: "user", content: input.test_input },
    ];

    const start = Date.now();
    const provider = getProvider(agent.model_provider);
    const result = await provider.chat({
      model: agent.model_name,
      messages,
      temperature: 0,
      max_tokens: agent.max_tokens,
    });

    const actual = result.content.trim();
    const expected = input.expected_output.trim();
    const passed = actual.toLowerCase().includes(expected.toLowerCase());
    const score = passed ? 1.0 : 0.0;

    // Create a run for traceability
    const { data: run } = await sb
      .from("runs")
      .insert({
        kind: "evaluation",
        status: "completed",
        agent_id: id,
        input: { test_input: input.test_input, expected_output: input.expected_output } as Record<string, Json>,
        output: { actual_output: actual } as Record<string, Json>,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        latency_ms: Date.now() - start,
        started_at: new Date(start).toISOString(),
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const { data: evaluation, error: evalErr } = await sb
      .from("evaluations")
      .insert({
        agent_id: id,
        eval_type: input.eval_type,
        score,
        max_score: 1.0,
        test_input: input.test_input,
        expected_output: input.expected_output,
        actual_output: actual,
        passed,
        run_id: run?.id ?? null,
      })
      .select()
      .single();

    if (evalErr) return dbErr(`POST /api/agents/${id}/evaluate`, evalErr);
    return ok({ evaluation }, 201);
  } catch (e) {
    console.error(`POST /api/agents/${id}/evaluate: uncaught`, e);
    return err("internal_error", 500);
  }
}

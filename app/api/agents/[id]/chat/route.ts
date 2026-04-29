import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { getProvider, smartStreamChat } from "@/lib/llm";
import type { ModelDecision } from "@/lib/llm";
import { RunTracer } from "@/lib/engine/runtime";
import { chatRequestSchema, parseBody, err } from "@/lib/domain";
import { requireScope } from "@/lib/platform/auth/scope";
import type { ChatMessage } from "@/lib/llm";
import type { Json } from "@/lib/database.types";
import type { AgentGuardPolicy } from "@/lib/engine/runtime/prompt-guard";
import type { ModelGoal } from "@/lib/decisions/model-selector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth gate : exécute des appels LLM côté agent — public = abus tokens.
  const { scope, error: scopeError } = await requireScope({
    context: `POST /api/agents/${id}/chat`,
  });
  if (scopeError || !scope) {
    return err(scopeError?.message ?? "not_authenticated", scopeError?.status ?? 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = parseBody(chatRequestSchema, body);
  if (!parsed.success) return parsed.response;

  const sb = requireServerSupabase();
  const userMessage = parsed.data.message;
  let conversationId = parsed.data.conversation_id ?? null;

  const { data: agent, error: agentErr } = await sb
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (agentErr || !agent) return err("agent_not_found", 404);

  if (!conversationId) {
    const { data: convo } = await sb
      .from("conversations")
      .insert({ agent_id: id, title: userMessage.slice(0, 80) })
      .select("id")
      .single();
    conversationId = convo?.id ?? null;
  }

  if (!conversationId) return err("failed_to_create_conversation", 500);

  await sb.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userMessage,
  });

  const [historyRes, skillsRes, memoriesRes] = await Promise.all([
    sb
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50),
    sb
      .from("agent_skills")
      .select("skill_id, priority, config, skills(name, prompt_template)")
      .eq("agent_id", id)
      .order("priority", { ascending: false }),
    sb
      .from("agent_memory")
      .select("key, value")
      .eq("agent_id", id)
      .order("importance", { ascending: false })
      .limit(20),
  ]);

  const skillsBlock = (skillsRes.data ?? [])
    .map((s) => {
      const skill = s.skills as unknown as { name: string; prompt_template: string } | null;
      return skill ? `[SKILL: ${skill.name}]\n${skill.prompt_template}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const memoryBlock = (memoriesRes.data ?? [])
    .map((m) => `- ${m.key}: ${m.value}`)
    .join("\n");

  const systemPrompt = [
    agent.system_prompt,
    skillsBlock ? `\n\n## Skills\n${skillsBlock}` : "",
    memoryBlock ? `\n\n## Memory\n${memoryBlock}` : "",
  ].join("");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...((historyRes.data ?? []) as ChatMessage[]),
  ];

  const guardPolicy = (agent.guard_policy as AgentGuardPolicy | null) ?? undefined;

  const tracer = new RunTracer(sb);
  const runId = await tracer.startRun({
    kind: "chat",
    agent_id: id,
    conversation_id: conversationId,
    input: { message: userMessage },
    cost_budget_usd: agent.cost_budget_per_run ?? undefined,
    guard_policy: guardPolicy,
  });

  if (memoriesRes.data && memoriesRes.data.length > 0) {
    await tracer.trace({
      kind: "memory_read",
      name: "load_agent_memory",
      input: { agent_id: id, count: memoriesRes.data.length },
      fn: async () => ({
        output: { memories: memoriesRes.data!.length },
      }),
    });
  }

  const useSmartRouting = parsed.data.smart_routing === true;
  const modelGoal: ModelGoal = parsed.data.model_goal ?? "balanced";

  const encoder = new TextEncoder();
  const llmStart = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let modelDecision: ModelDecision | undefined;
      let actualModelUsed = `${agent.model_provider}/${agent.model_name}`;

      try {
        if (useSmartRouting) {
          const smartStream = smartStreamChat(sb, {
            goal: modelGoal,
            agent_provider: agent.model_provider,
            agent_model: agent.model_name,
            messages,
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
            top_p: agent.top_p,
            tracer,
          });

          for await (const chunk of smartStream) {
            if (chunk.decision) modelDecision = chunk.decision;
            if (chunk.profile_used) actualModelUsed = chunk.profile_used;
            fullContent += chunk.delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta, done: chunk.done, run_id: runId })}\n\n`),
            );
            if (chunk.done) break;
          }
        } else {
          const provider = getProvider(agent.model_provider);
          const stream = provider.streamChat({
            model: agent.model_name,
            messages,
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
            top_p: agent.top_p,
            stream: true,
          });

          for await (const chunk of stream) {
            fullContent += chunk.delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta, done: chunk.done, run_id: runId })}\n\n`),
            );
            if (chunk.done) break;
          }
        }
      } catch (streamErr) {
        const msg = streamErr instanceof Error ? streamErr.message : "stream_failed";
        console.error(`chat stream error agent=${id} run=${runId}:`, msg);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg, done: true, run_id: runId })}\n\n`),
        );
        await tracer.endRun("failed", {}, msg);
        controller.close();
        return;
      }

      const llmLatency = Date.now() - llmStart;

      await sb.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: fullContent,
        model_used: actualModelUsed,
        latency_ms: llmLatency,
      });

      const traceResult = await tracer.trace({
        kind: "llm_call",
        name: actualModelUsed,
        input: {
          messages_count: messages.length,
          system_prompt_length: systemPrompt.length,
          smart_routing: useSmartRouting,
          model_goal: useSmartRouting ? modelGoal : undefined,
          was_overridden: modelDecision?.was_overridden ?? false,
        },
        fn: async () => ({
          output: { content: fullContent, content_length: fullContent.length } as Record<string, Json>,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          model_used: actualModelUsed,
        }),
      });

      const validation = traceResult.validation;

      await tracer.endRun("completed", {
        content_length: fullContent.length,
        conversation_id: conversationId,
        output_trust: validation?.trust ?? "unverified",
        output_classification: validation?.classification ?? "valid",
        output_score: validation?.score ?? 1,
        smart_routing: useSmartRouting,
        model_decision: modelDecision ? {
          selected: `${modelDecision.selected_provider}/${modelDecision.selected_model}`,
          was_overridden: modelDecision.was_overridden,
          reason: modelDecision.reason,
          goal: modelDecision.goal,
        } : undefined,
      });

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          done: true,
          run_id: runId,
          model_used: actualModelUsed,
          validation: validation ? {
            trust: validation.trust,
            classification: validation.classification,
            score: validation.score,
          } : undefined,
          model_decision: modelDecision ? {
            selected: `${modelDecision.selected_provider}/${modelDecision.selected_model}`,
            was_overridden: modelDecision.was_overridden,
            reason: modelDecision.reason,
            goal: modelDecision.goal,
            fallback_count: modelDecision.fallback_count,
          } : undefined,
        })}\n\n`),
      );

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": conversationId,
      "X-Run-Id": runId,
    },
  });
}

/**
 * @deprecated Legacy v1 chat pipeline.
 * Active only when NEXT_PUBLIC_USE_V2 === "false".
 * Canonical replacement: /api/orchestrate (v2 SSE pipeline).
 */
import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { RunTracer } from "@/lib/runtime";
import type { ChatMessage } from "@/lib/llm";
import type { Json } from "@/lib/database.types";
import type { AgentGuardPolicy } from "@/lib/runtime/prompt-guard";
import { getUserId } from "@/lib/get-user-id";
import { SYSTEM_CONFIG } from "@/lib/system/config";
import { runOrchestrator } from "@/lib/orchestrator";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { executeToolCall } from "@/lib/agent/tool-handlers";
import { runManagedSession } from "@/lib/managed-agent/session-runner";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARST_SLUG = "hearst";

const HEARST_SYSTEM_PROMPT = `Tu es Hearst — assistant intelligent et système d'action.
Tu gères les messages, les événements et les documents de l'utilisateur.

## COMMENT DÉCIDER QUOI FAIRE

1. ANALYSER la demande : que veut l'utilisateur ?
2. DÉCIDER si un outil est nécessaire :
   - "mes messages" → appeler get_messages
   - "qu'est-ce qui est important ?" → appeler get_messages, filtrer les urgents
   - "résume mes messages" → appeler get_messages, puis résumer
   - "hello" / "merci" / question vague → NE PAS appeler d'outil
3. RÉPONDRE intelligemment avec les données

## RÈGLE DE PARCIMONIE

- N'appelle un outil QUE si la demande le nécessite.
- Ne jamais appeler plusieurs outils quand un seul suffit.
- Si le contexte contient déjà les données, ne pas re-fetcher.
- Si la demande est conversationnelle → répondre directement.

## MODES DE RÉPONSE

MODE CONVERSATION (message vague, social, exploratoire)
→ Répondre naturellement, proposer ce que tu peux faire.
→ Exemple : "Salut — tu veux voir tes messages ou ton agenda ?"

MODE INFORMATIF (question sur les données)
→ Utiliser les données réelles. Vue claire : totaux, urgents, points clés.
→ Exemple : "15 messages, 3 urgents. Tu veux les traiter ?"

MODE ACTION (intention claire et tâche exécutable)
→ Résultat direct, urgents en premier.
→ Exemple :
  "3 urgents :
  — Client X — deadline demain
  — Mention facture
  — Validation contrat
  [Répondre]"

PRIORITÉ SI DOUTE : conversation > informatif > action.

## RAISONNEMENT PAR CAPACITÉ

Tu raisonnes en capacités, jamais en fournisseurs.
- "messages" = tous les messages de l'utilisateur (peu importe la source)
- "événements" = tous les événements de l'agenda
- "documents" = tous les fichiers
Tu n'exposes jamais quel service exact est utilisé, sauf si l'utilisateur le demande explicitement.
Si l'utilisateur dit "mes messages Slack", tu peux mentionner Slack dans ta réponse — mais seulement parce qu'il l'a nommé.

## APRÈS UN APPEL OUTIL

- Analyser les résultats : filtrer, prioriser, résumer.
- Mettre les urgents en premier.
- Donner le nombre total et les points d'attention.
- Ne pas lister tous les messages si c'est inutile — résumer intelligemment.
- Proposer une action seulement si elle a du sens.
- Ne jamais exposer les détails techniques (providers, tokens, API).
- Dire "message" ou "notification", jamais "email Gmail" ou "message Slack".

## DONNÉES DU CONTEXTE

- Les métriques (urgents=X, non_lus=Y) sont exactes quand fournies.
- S'appuyer dessus. Ne jamais inventer de chiffres.
- Si urgents > 0, toujours les mentionner en priorité.
- Si aucune donnée fournie, ne pas inventer.

## BLOCAGE (service non connecté)

→ Expliquer simplement, proposer la solution.
→ "Service non connecté. Connecte-le dans Applications."

## HORS SCOPE

→ "Je gère tes messages, agenda et documents. Que veux-tu traiter ?"

## STYLE

Naturel, direct, intelligent. Court quand suffisant, détaillé quand utile. Toujours en français.

## INTERDIT

- Inventer des données.
- Naviguer automatiquement.
- Appeler un outil sans raison.
- Nommer les fournisseurs (Gmail, Slack, Drive, etc.).
- Répondre vide sans explication.`;

const requestSchema = z.object({
  message: z.string().min(1).max(100000),
  conversation_id: z.string().uuid().nullish(),
  context: z.object({
    surface: z.string().optional(),
    selectedItem: z.object({
      type: z.string(),
      id: z.string(),
      title: z.string(),
      from: z.string().optional(),
      preview: z.string().optional(),
      provider: z.string().optional(),
    }).optional().nullable(),
    connectedServices: z.array(z.string()).optional(),
  }).optional(),
});

/* buildContextBlock moved to lib/orchestrator.ts */

async function resolveHearstAgent(sb: ReturnType<typeof requireServerSupabase>) {
  const { data: existing } = await sb
    .from("agents")
    .select("*")
    .eq("slug", HEARST_SLUG)
    .single();

  if (existing) {
    const needsUpdate =
      existing.system_prompt !== HEARST_SYSTEM_PROMPT ||
      existing.model_name !== "claude-sonnet-4-6";
    if (needsUpdate) {
      await sb.from("agents").update({
        system_prompt: HEARST_SYSTEM_PROMPT,
        model_name: "claude-sonnet-4-6",
      }).eq("id", existing.id);
      existing.system_prompt = HEARST_SYSTEM_PROMPT;
      existing.model_name = "claude-sonnet-4-6";
    }
    return existing;
  }

  const { data: created, error } = await sb
    .from("agents")
    .insert({
      name: "Hearst",
      slug: HEARST_SLUG,
      description: "Assistant global Hearst OS",
      model_provider: "anthropic",
      model_name: "claude-sonnet-4-6",
      system_prompt: HEARST_SYSTEM_PROMPT,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 1,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("[Chat] Failed to create Hearst agent:", error.message);
    return null;
  }

  console.log("[Chat] Created default Hearst agent:", created.id);
  return created;
}

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.error("[Chat] JSON parse failed");
    return jsonErr("Invalid JSON body", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[Chat] ZOD ERROR", JSON.stringify(parsed.error.issues));
    return jsonErr(`invalid_request: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, 400);
  }

  try {
  const sb = requireServerSupabase();
  const { message: userMessage, conversation_id, context } = parsed.data;
  const userId = await getUserId();
  if (!userId) {
    return jsonErr("not_authenticated", 401);
  }
  console.log("[Chat] userId:", userId, "| surface:", context?.surface ?? "home", "| msg:", userMessage.slice(0, 50));

  const agent = await resolveHearstAgent(sb);
  if (!agent) {
    console.error("[Chat] Agent not found");
    return jsonErr("agent_unavailable", 503);
  }
  console.log("[Chat] agent:", agent.id, agent.slug);

  let conversationId = conversation_id ?? null;

  if (conversationId) {
    const { data: existing } = await sb
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_identifier", userId)
      .single();
    if (!existing) {
      return jsonErr("conversation_not_found", 404);
    }
  } else {
    const { data: convo, error: convoErr } = await sb
      .from("conversations")
      .insert({ agent_id: agent.id, title: userMessage.slice(0, 80), user_identifier: userId })
      .select("id")
      .single();
    if (convoErr) console.error("[Chat] Conversation create failed:", convoErr.message);
    conversationId = convo?.id ?? null;
  }

  if (!conversationId) return jsonErr("failed_to_create_conversation", 500);

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
      .eq("agent_id", agent.id)
      .order("priority", { ascending: false }),
    sb
      .from("agent_memory")
      .select("key, value")
      .eq("agent_id", agent.id)
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

  if (SYSTEM_CONFIG.useV2Orchestrator) {
    console.warn("[Chat] Legacy /api/chat called while v2 orchestrator is enabled — consider migrating to /api/orchestrate");
  }

  const orchResult = await runOrchestrator({
    message: userMessage,
    surface: context?.surface ?? "home",
    userId,
    connectedServices: context?.connectedServices,
    selectedItem: context?.selectedItem as Record<string, unknown> | null,
  });
  const contextBlock = orchResult.contextBlock;

  const systemPrompt = [
    agent.system_prompt,
    contextBlock,
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
    agent_id: agent.id,
    conversation_id: conversationId,
    input: { message: userMessage, surface: context?.surface },
    cost_budget_usd: agent.cost_budget_per_run ?? undefined,
    guard_policy: guardPolicy,
  });

  if (memoriesRes.data && memoriesRes.data.length > 0) {
    await tracer.trace({
      kind: "memory_read",
      name: "load_agent_memory",
      input: { agent_id: agent.id, count: memoriesRes.data.length },
      fn: async () => ({
        output: { memories: memoriesRes.data!.length },
      }),
    });
  }

  const encoder = new TextEncoder();
  const llmStart = Date.now();
  const actualModelUsed = `${agent.model_provider}/${agent.model_name}`;
  const MAX_TOOL_ROUNDS = 5;

  const readable = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let fullContent = "";

      // ── Blocked mode: skip LLM, send final immediately ──
      if (orchResult.blockedReason) {
        fullContent = orchResult.blockedReason;
        emit({ type: "final", content: fullContent, done: true, run_id: runId });
        console.log("[ORCH] FINAL SENT (blocked)");
        await tracer.endRun("completed", { content_length: fullContent.length, conversation_id: conversationId });
        controller.close();
        return;
      }

      // ── Managed agent mode: delegate to Anthropic managed session ──
      if (orchResult.mode === "managed" && orchResult.managedPrompt) {
        console.log("[ORCH] Delegating to managed agent");
        emit({ type: "step", tool: "agent", status: "running", run_id: runId });

        try {
          for await (const event of runManagedSession(orchResult.managedPrompt, userMessage.slice(0, 60))) {
            switch (event.type) {
              case "step":
                emit({ type: "step", tool: event.tool, status: event.status, run_id: runId });
                break;
              case "message":
                if (event.content) {
                  fullContent += event.content;
                  emit({ delta: event.content, done: false, run_id: runId });
                }
                break;
              case "idle":
                fullContent = event.content ?? fullContent;
                break;
              case "error":
                fullContent = event.content ?? "Erreur agent. Réessayez.";
                break;
            }
          }

          emit({ type: "step", tool: "agent", status: "done", run_id: runId });
        } catch (managedErr) {
          const msg = managedErr instanceof Error ? managedErr.message : "managed_agent_failed";
          console.error("[ORCH] Managed agent error:", msg);
          fullContent = "L'agent autonome n'est pas disponible. Réessayez.";
        }

        if (!fullContent.trim()) {
          fullContent = "L'agent n'a pas produit de résultat.";
        }

        const llmLatency = Date.now() - llmStart;
        await sb.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: fullContent,
          model_used: "managed-agent",
          latency_ms: llmLatency,
        });

        await tracer.endRun("completed", {
          content_length: fullContent.length,
          conversation_id: conversationId,
          mode: "managed",
        });

        emit({ type: "final", content: fullContent, done: true, run_id: runId, model_used: "managed-agent" });
        console.log("[ORCH] FINAL SENT (managed)");
        controller.close();
        return;
      }

      try {
        const provider = new AnthropicProvider();

        // Build Anthropic-format messages (separate system)
        const systemContent = systemPrompt;
        const convMessages: Anthropic.MessageParam[] = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        let round = 0;

        // ── Tool-calling loop ──
        while (round < MAX_TOOL_ROUNDS) {
          round++;
          console.log(`[ORCH] TOOL ROUND ${round}`);

          const result = await provider.chatWithTools(
            {
              model: agent.model_name,
              messages: [{ role: "system", content: systemContent }, ...convMessages] as ChatMessage[],
              temperature: agent.temperature,
              max_tokens: agent.max_tokens,
              top_p: agent.top_p,
            },
            AGENT_TOOLS,
          );


          if (result.toolCalls.length === 0 || result.stopReason !== "tool_use") {
            // No tools — this is the final text response. Stream it.
            fullContent = result.text;
            console.log(`[ORCH] No tool calls — final text, len=${fullContent.length}`);
            break;
          }

          // LLM wants to call tools
          // Add the assistant message with tool_use blocks to conversation
          convMessages.push({
            role: "assistant",
            content: result.rawResponse.content,
          });

          // Execute each tool and collect results
          const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

          for (const tc of result.toolCalls) {
            emit({ type: "step", tool: tc.name, status: "running", run_id: runId });
            console.log(`[ORCH] Executing tool: ${tc.name}`);

            await tracer.trace({
              kind: "tool_call",
              name: `tool:${tc.name}`,
              input: { tool: tc.name, input_keys: Object.keys(tc.input) },
              fn: async () => {
                const toolResult = await executeToolCall(tc.name, userId, tc.input);

                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: tc.id,
                  content: toolResult.data,
                });

                emit({
                  type: "step",
                  tool: tc.name,
                  status: toolResult.success ? "done" : "error",
                  run_id: runId,
                });

                return {
                  output: { tool: tc.name, success: toolResult.success, latency_ms: toolResult.latency_ms } as Record<string, Json>,
                };
              },
            });
          }

          // Add tool results as a user message for next round
          convMessages.push({
            role: "user",
            content: toolResultBlocks,
          });
        }

        // ── Stream the final text response ──
        if (!fullContent.trim()) {
          // If the loop ended without text (e.g. last round was tool calls),
          // do one more non-tool call to get the final response
          console.log("[ORCH] Final round — getting text response");
          const finalResult = await provider.chatWithTools(
            {
              model: agent.model_name,
              messages: [{ role: "system", content: systemContent }, ...convMessages] as ChatMessage[],
              temperature: agent.temperature,
              max_tokens: agent.max_tokens,
              top_p: agent.top_p,
            },
          );
          fullContent = finalResult.text;
        }

        if (!fullContent.trim()) {
          fullContent = "Je n'ai pas de réponse pour le moment. Réessaie.";
          console.warn("[ORCH] Empty content — fallback applied");
        }

        // Stream the final content as deltas for real-time display
        const CHUNK_SIZE = 20;
        for (let i = 0; i < fullContent.length; i += CHUNK_SIZE) {
          const chunk = fullContent.slice(i, i + CHUNK_SIZE);
          emit({ delta: chunk, done: false, run_id: runId });
        }

      } catch (streamErr) {
        const msg = streamErr instanceof Error ? streamErr.message : "stream_failed";
        console.error(`[ORCH] STATE ERROR — agent=${agent.id} run=${runId}:`, msg);
        emit({ type: "final", content: "Erreur. Réessayez.", error: true, done: true, run_id: runId });
        console.log("[ORCH] FINAL SENT (error)");
        await tracer.endRun("failed", {}, msg);
        controller.close();
        return;
      }

      console.log("[ORCH] STATE STREAM_RESULT — complete, len=" + fullContent.length);

      const llmLatency = Date.now() - llmStart;

      await sb.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: fullContent,
        model_used: actualModelUsed,
        latency_ms: llmLatency,
      });

      await tracer.trace({
        kind: "llm_call",
        name: actualModelUsed,
        input: {
          messages_count: messages.length,
          system_prompt_length: systemPrompt.length,
          surface: context?.surface ?? "home",
          has_selected_item: !!context?.selectedItem,
        },
        fn: async () => ({
          output: { content: fullContent, content_length: fullContent.length } as Record<string, Json>,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          model_used: actualModelUsed,
        }),
      });

      await tracer.endRun("completed", {
        content_length: fullContent.length,
        conversation_id: conversationId,
        surface: context?.surface ?? "home",
      });

      emit({
        type: "final",
        content: fullContent,
        done: true,
        run_id: runId,
        model_used: actualModelUsed,
      });
      console.log("[ORCH] FINAL SENT (complete)");

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

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Chat] INTERNAL ERROR:", msg);
    return jsonErr(`internal_error: ${msg}`, 500);
  }
}

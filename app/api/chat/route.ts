import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { getProvider } from "@/lib/llm";
import { RunTracer } from "@/lib/runtime";
import type { ChatMessage } from "@/lib/llm";
import type { Json } from "@/lib/database.types";
import type { AgentGuardPolicy } from "@/lib/runtime/prompt-guard";
import { getUserId } from "@/lib/get-user-id";
import { getDataSnapshot, snapshotToText } from "@/lib/agent/data-functions";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARST_SLUG = "hearst";

const HEARST_SYSTEM_PROMPT = `Tu es Hearst. Système d'action.

RÈGLE : 1 info + 1 CTA. Rien d'autre. Jamais.

PRIORITÉ (messages) :
IF urgents > 0 → "X urgents" + [Répondre]
ELSE IF slack > 0 → "X Slack" + [Répondre]
ELSE → "X messages" + [Répondre]

PRIORITÉ (autres) :
événements → "X événements" + [Répondre]
fichiers → "X fichiers" + [Répondre]
rien → "Aucun urgent"

CTA : toujours [Répondre]. Second optionnel discret : [Voir].

INTERDIT : "dont", multi métriques, 2 CTA égaux, phrases > 4 mots, listes, "Bonjour", questions, explications, termes techniques.

MAUVAIS : "15 messages dont 3 urgents" / "Bonjour, comment puis-je" / "Voici un résumé"
BON : "3 urgents\\n[Répondre]"

Données réelles uniquement. Jamais inventer. Français.`;

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

const SURFACE_LABELS: Record<string, string> = {
  inbox: "la boîte de réception",
  calendar: "l'agenda",
  files: "les fichiers",
  tasks: "les tâches",
  apps: "les applications",
};

async function buildContextBlock(
  context: z.infer<typeof requestSchema>["context"] | undefined,
  userId: string | null,
): Promise<string> {
  const parts: string[] = [];
  const surface = context?.surface ?? "home";

  if (surface !== "home") {
    parts.push(`Surface active : ${SURFACE_LABELS[surface] ?? surface}`);
  }

  if (context?.selectedItem) {
    const item = context.selectedItem;
    let desc = `Élément sélectionné : ${item.title}`;
    if (item.from) desc += ` (de ${item.from})`;
    if (item.preview) desc += `\nAperçu : ${item.preview.slice(0, 200)}`;
    parts.push(desc);
  }

  if (context?.connectedServices && context.connectedServices.length > 0) {
    parts.push(`Services connectés : ${context.connectedServices.join(", ")}`);
  }

  if (userId) {
    try {
      const snapshot = await getDataSnapshot(userId, surface);
      const dataText = snapshotToText(snapshot);
      if (dataText) parts.push(`\n${dataText}`);
    } catch (err) {
      console.error("[Chat] Data fetch failed:", err instanceof Error ? err.message : err);
    }
  }

  if (parts.length === 0) return "";
  return `\n\n## Contexte\n${parts.join("\n")}`;
}

async function resolveHearstAgent(sb: ReturnType<typeof requireServerSupabase>) {
  const { data: existing } = await sb
    .from("agents")
    .select("*")
    .eq("slug", HEARST_SLUG)
    .single();

  if (existing) {
    if (existing.system_prompt !== HEARST_SYSTEM_PROMPT) {
      await sb.from("agents").update({ system_prompt: HEARST_SYSTEM_PROMPT }).eq("id", existing.id);
      existing.system_prompt = HEARST_SYSTEM_PROMPT;
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
      model_name: "claude-sonnet-4-20250514",
      // NOTE: agent already created in DB uses this model.
      // If deprecated, update the row in Supabase: UPDATE agents SET model_name='claude-sonnet-4-latest' WHERE slug='hearst';
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

  console.log("[Chat] RAW BODY", JSON.stringify(body));

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[Chat] ZOD ERROR", JSON.stringify(parsed.error.issues));
    return jsonErr(`invalid_request: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, 400);
  }

  try {
  const sb = requireServerSupabase();
  const { message: userMessage, conversation_id, context } = parsed.data;
  const userId = await getUserId();
  console.log("[Chat] userId:", userId, "| surface:", context?.surface ?? "home", "| msg:", userMessage.slice(0, 50));

  const agent = await resolveHearstAgent(sb);
  if (!agent) {
    console.error("[Chat] Agent not found");
    return jsonErr("agent_unavailable", 503);
  }
  console.log("[Chat] agent:", agent.id, agent.slug);

  let conversationId = conversation_id ?? null;

  if (!conversationId) {
    const { data: convo, error: convoErr } = await sb
      .from("conversations")
      .insert({ agent_id: agent.id, title: userMessage.slice(0, 80) })
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

  const contextBlock = await buildContextBlock(context, userId);

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

  const readable = new ReadableStream({
    async start(controller) {
      let fullContent = "";

      try {
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
      } catch (streamErr) {
        const msg = streamErr instanceof Error ? streamErr.message : "stream_failed";
        console.error(`[Chat] stream error agent=${agent.id} run=${runId}:`, msg);
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

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          done: true,
          run_id: runId,
          model_used: actualModelUsed,
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

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Chat] INTERNAL ERROR:", msg);
    return jsonErr(`internal_error: ${msg}`, 500);
  }
}

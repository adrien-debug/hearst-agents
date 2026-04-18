import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireServerSupabase } from "@/lib/supabase-server";
import { getProvider } from "@/lib/llm";
import { getUserId } from "@/lib/get-user-id";
import { getDataSnapshot, snapshotToText } from "@/lib/agent/data-functions";
import type { ChatMessage } from "@/lib/llm";
import { z } from "zod";

function getRawSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARST_SLUG = "hearst";

const actionSchema = z.object({
  id: z.string(),
  label: z.string(),
  service: z.string().optional(),
});

const requestSchema = z.object({
  mission_id: z.string(),
  title: z.string(),
  surface: z.string(),
  actions: z.array(actionSchema),
  services: z.array(z.string()),
});

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
    return jsonErr("Invalid JSON body", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonErr("invalid_request", 400);

  const userId = await getUserId();
  if (!userId) return jsonErr("not_authenticated", 401);

  const sb = requireServerSupabase();
  const raw = getRawSupabase();
  const { mission_id, title, surface, actions, services } = parsed.data;

  const { data: agent } = await sb
    .from("agents")
    .select("*")
    .eq("slug", HEARST_SLUG)
    .single();

  if (!agent) return jsonErr("agent_unavailable", 503);

  await raw.from("missions").upsert({
    id: mission_id,
    user_id: userId,
    agent_id: agent.id,
    title,
    surface,
    status: "running",
    actions: actions as unknown as Record<string, unknown>[],
    services,
  }, { onConflict: "id" });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        let snapshot;
        try {
          snapshot = await getDataSnapshot(userId, surface);
        } catch {
          snapshot = {};
        }
        const dataText = snapshotToText(snapshot);

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const stepStart = Date.now();

          send({ type: "step_started", action_id: action.id });

          await raw.from("mission_runs").insert({
            mission_id,
            action_id: action.id,
            status: "running",
            input: { label: action.label, service: action.service },
            started_at: new Date().toISOString(),
          });

          try {
            const stepPrompt = buildStepPrompt(title, action.label, i, actions.length, dataText, action.service);

            const provider = getProvider(agent.model_provider);
            let stepResult = "";

            const stream = provider.streamChat({
              model: agent.model_name,
              messages: [
                { role: "system", content: stepPrompt },
                { role: "user", content: `Exécute cette étape : "${action.label}"` },
              ] as ChatMessage[],
              temperature: 0.4,
              max_tokens: 1024,
              top_p: 1,
              stream: true,
            });

            for await (const chunk of stream) {
              stepResult += chunk.delta;
              if (chunk.done) break;
            }

            const preview = stepResult.slice(0, 200).replace(/\n/g, " ").trim();
            const latency = Date.now() - stepStart;

            await raw.from("mission_runs")
              .update({
                status: "completed",
                output: { result: stepResult },
                latency_ms: latency,
                finished_at: new Date().toISOString(),
              })
              .eq("mission_id", mission_id)
              .eq("action_id", action.id);

            send({
              type: "step_completed",
              action_id: action.id,
              preview,
              latency_ms: latency,
            });
          } catch (stepErr) {
            const errMsg = stepErr instanceof Error ? stepErr.message : "Erreur inattendue";
            console.error(`[Mission] Step "${action.label}" failed:`, errMsg);

            await raw.from("mission_runs")
              .update({
                status: "failed",
                error: errMsg,
                finished_at: new Date().toISOString(),
              })
              .eq("mission_id", mission_id)
              .eq("action_id", action.id);

            send({ type: "step_failed", action_id: action.id, error: errMsg });

            await raw.from("missions")
              .update({ status: "failed", error: `Étape "${action.label}" a échoué: ${errMsg}`, updated_at: new Date().toISOString() })
              .eq("id", mission_id);

            send({ type: "mission_failed", error: `Étape "${action.label}" a échoué` });
            controller.close();
            return;
          }
        }

        const lastRun = await raw.from("mission_runs")
          .select("output")
          .eq("mission_id", mission_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const finalResult = (lastRun.data?.output as Record<string, string>)?.result
          ?? `${title} — terminé.`;

        await raw.from("missions")
          .update({
            status: "completed",
            result: finalResult.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", mission_id);

        send({
          type: "mission_completed",
          result: finalResult.slice(0, 500),
        });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur interne";
        console.error("[Mission] Execution failed:", msg);
        send({ type: "mission_failed", error: msg });

        await raw.from("missions")
          .update({ status: "failed", error: msg, updated_at: new Date().toISOString() })
          .eq("id", mission_id);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildStepPrompt(
  missionTitle: string,
  stepLabel: string,
  stepIndex: number,
  totalSteps: number,
  dataText: string,
  service?: string,
): string {
  return `Tu exécutes une mission pour l'utilisateur.

Mission : "${missionTitle}"
Étape ${stepIndex + 1}/${totalSteps} : "${stepLabel}"
${service ? `Service : ${service}` : ""}

${dataText ? `## Données disponibles\n${dataText}` : "Aucune donnée disponible."}

## Instructions

Exécute cette étape en te basant sur les données réelles.
Réponds de manière concise avec le résultat.
N'invente rien. Si les données sont insuffisantes, dis-le.
Pas de jargon technique.`;
}

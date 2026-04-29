/**
 * OpenAI Realtime — mint d'éphémères pour le mode voix ambient (Sig 6).
 *
 * Le client browser ouvre ensuite un PeerConnection direct vers
 * api.openai.com/v1/realtime via le ephemeralKey, jamais le SERVICE_KEY
 * complet. Le token expire après ~60s.
 *
 * Function calling : les tools sont passés au mint pour que le modèle
 * puisse les invoquer pendant la conversation. Le client reçoit les events
 * `response.function_call_arguments.done` via DataChannel et exécute via
 * /api/v2/voice/tool-call.
 */

import type { VoiceToolDef } from "@/lib/voice/tools";

const OPENAI_BASE = "https://api.openai.com/v1";

interface MintRealtimeSessionInput {
  tools?: VoiceToolDef[];
}

export async function mintRealtimeSession(
  input: MintRealtimeSessionInput = {},
): Promise<{
  sessionId: string;
  ephemeralKey: string;
  expiresAt: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI non configuré");

  const body: Record<string, unknown> = {
    model: "gpt-4o-realtime-preview",
    voice: "alloy",
    modalities: ["audio", "text"],
    instructions:
      [
        "Tu es l'assistant ambient de Hearst OS.",
        "Réponds en français, ton conversationnel, phrases courtes.",
        "L'utilisateur parle naturellement pendant qu'il travaille — sois bref, utile, jamais bavard.",
        "Quand l'utilisateur demande une action concrète (lancer un meeting bot, ouvrir une simulation, générer une image, envoyer un mail, créer une tâche, etc.), invoque l'outil correspondant — ne te contente pas de décrire ce que tu ferais.",
        "Tu as accès aux tools internes Hearst (start_meeting_bot, start_simulation, generate_image) et aux tools des apps connectées de l'utilisateur (Gmail, Slack, Linear, Notion, Calendar, Drive, etc. — préfixés par le nom de l'app en majuscules, ex: GMAIL_SEND_EMAIL).",
        "Pour les actions DESTRUCTIVES (envoyer un mail, créer un ticket, supprimer, archiver, poster un message public), confirme oralement AVANT d'invoquer le tool : redonne à l'utilisateur les paramètres clés (destinataire, sujet, contenu) et demande 'je l'envoie ?'. Invoque le tool seulement après un 'oui', 'confirme', 'go' explicite.",
        "Pour les actions LECTURE (chercher, lister, récupérer), invoque directement sans demander.",
      ].join(" "),
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${OPENAI_BASE}/realtime/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[OpenAI Realtime] mint failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    id: string;
    client_secret: { value: string; expires_at: number };
  };

  return {
    sessionId: data.id,
    ephemeralKey: data.client_secret.value,
    expiresAt: data.client_secret.expires_at,
  };
}

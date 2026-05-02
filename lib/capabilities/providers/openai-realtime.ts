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
import {
  resolveRealtimeVoice,
  DEFAULT_REALTIME_VOICE,
  type RealtimeVoice,
} from "@/lib/voice/voice-mapping";

const OPENAI_BASE = "https://api.openai.com/v1";

interface MintRealtimeSessionInput {
  tools?: VoiceToolDef[];
  /** Voix Realtime explicite — overrides `personaTone`. */
  voice?: RealtimeVoice;
  /** Tone de la persona active — résolu via `resolveRealtimeVoice`. */
  personaTone?: string;
  /** Apps Composio réellement connectées par l'utilisateur (slugs lowercase, ex: ["gmail","slack"]).
   * Injecté dynamiquement dans les instructions pour que la voix annonce
   * correctement ce qu'elle peut faire. Sans ça, le modèle hallucine ou nie
   * avoir accès aux apps connectées. */
  connectedApps?: string[];
}

export async function mintRealtimeSession(
  input: MintRealtimeSessionInput = {},
): Promise<{
  sessionId: string;
  ephemeralKey: string;
  expiresAt: number;
  voice: RealtimeVoice;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI non configuré");

  // Voix : explicite > tone résolu > default alloy
  const voice: RealtimeVoice =
    input.voice ??
    (input.personaTone ? resolveRealtimeVoice(input.personaTone) : DEFAULT_REALTIME_VOICE);

  const connectedAppsLine =
    input.connectedApps && input.connectedApps.length > 0
      ? `L'utilisateur a actuellement ${input.connectedApps.length} apps connectées : ${input.connectedApps.join(", ")}. N'invente pas d'autres services — si l'utilisateur te demande Notion ou GitHub par exemple et qu'ils ne sont pas dans cette liste, dis-lui qu'il faut d'abord les connecter dans /apps.`
      : "L'utilisateur n'a aucune app tierce connectée pour le moment. Si on te demande Gmail/Slack/etc, dis-lui de les connecter dans /apps avant.";

  const body: Record<string, unknown> = {
    model: "gpt-4o-realtime-preview",
    voice,
    modalities: ["audio", "text"],
    instructions:
      [
        "Tu es l'assistant ambient de Hearst OS.",
        "Réponds en français, ton conversationnel, phrases courtes.",
        "L'utilisateur parle naturellement pendant qu'il travaille — sois bref, utile, jamais bavard.",
        "Quand l'utilisateur demande une action concrète (lancer un meeting bot, ouvrir une simulation, générer une image, envoyer un mail, créer une tâche, etc.), invoque l'outil correspondant — ne te contente pas de décrire ce que tu ferais.",
        "Tu as accès aux tools internes Hearst (start_meeting_bot, start_simulation, generate_image, start_browser) et aux tools des apps connectées (préfixés par le nom de l'app en majuscules, ex: GMAIL_FETCH_EMAILS, SLACK_SEND_MESSAGE).",
        connectedAppsLine,
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
    voice,
  };
}

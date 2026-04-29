/**
 * OpenAI Realtime — mint d'éphémères pour le mode voix ambient (Sig 6).
 *
 * Le client browser ouvre ensuite un PeerConnection direct vers
 * api.openai.com/v1/realtime via le ephemeralKey, jamais le SERVICE_KEY
 * complet. Le token expire après ~60s.
 */

const OPENAI_BASE = "https://api.openai.com/v1";

export async function mintRealtimeSession(): Promise<{
  sessionId: string;
  ephemeralKey: string;
  expiresAt: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI non configuré");

  const res = await fetch(`${OPENAI_BASE}/realtime/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview",
      voice: "alloy",
      modalities: ["audio", "text"],
      instructions:
        "Tu es l'assistant ambient de Hearst OS. Réponds en français, ton conversationnel, phrases courtes. L'utilisateur parle naturellement pendant qu'il travaille — sois bref, utile, jamais bavard.",
    }),
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

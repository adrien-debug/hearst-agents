import { DeepgramClient, type ListenV1Response, type ListenV1AcceptedResponse } from "@deepgram/sdk";
import Anthropic from "@anthropic-ai/sdk";

function isSyncResponse(
  r: ListenV1Response | ListenV1AcceptedResponse,
): r is ListenV1Response {
  return "results" in r;
}

export async function transcribeAudio(params: {
  audioUrl: string;
  language?: string;
  diarize?: boolean;
}): Promise<{
  transcript: string;
  speakers: Array<{ speaker: number; text: string; start: number; end: number }>;
}> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("Deepgram non configuré");

  const client = new DeepgramClient({ apiKey });

  const result = await client.listen.v1.media.transcribeUrl({
    url: params.audioUrl,
    model: "nova-2",
    language: params.language ?? "fr",
    diarize: params.diarize ?? true,
    utterances: true,
  });

  if (!isSyncResponse(result)) {
    throw new Error("[Deepgram] réponse asynchrone inattendue");
  }

  const transcript =
    result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

  const speakers = (result.results?.utterances ?? []).map((u) => ({
    speaker: u.speaker ?? 0,
    text: u.transcript ?? "",
    start: u.start ?? 0,
    end: u.end ?? 0,
  }));

  return { transcript, speakers };
}

export async function extractActionItems(transcript: string): Promise<
  Array<{
    action: string;
    owner?: string;
    deadline?: string;
  }>
> {
  if (!transcript.trim()) return [];

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extrais les actions concrètes de ce transcript de réunion. Retourne UNIQUEMENT un tableau JSON valide, sans texte autour, avec des objets ayant les clés "action" (string), "owner" (string|null), "deadline" (string|null). Si aucune action, retourne [].

Transcript :
${transcript}`,
        },
      ],
    });

    const text =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      action: string;
      owner?: string | null;
      deadline?: string | null;
    }>;

    return parsed.map((item) => ({
      action: item.action,
      ...(item.owner ? { owner: item.owner } : {}),
      ...(item.deadline ? { deadline: item.deadline } : {}),
    }));
  } catch {
    return [];
  }
}

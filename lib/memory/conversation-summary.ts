import Anthropic from "@anthropic-ai/sdk";
import { getRedis } from "@/lib/platform/redis/client";

const SUMMARY_TTL = 60 * 60 * 24 * 30; // 30 jours
const MAX_BUFFER = 20;
const key = (userId: string) => `memory:summary:${userId}`;

type MessageEntry = { role: "user" | "assistant"; content: string };

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

async function compress(messages: MessageEntry[]): Promise<string> {
  const anthropic = client();
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  if (!anthropic) return conversationText;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Résume cette conversation en 2-3 phrases concises, en retenant les points clés et les intentions de l'utilisateur :\n\n${conversationText}`,
        },
      ],
    });
    const block = res.content[0];
    return block.type === "text" ? block.text : conversationText;
  } catch (err) {
    console.warn("[memory/summary] compression LLM échouée:", err);
    return conversationText;
  }
}

export async function appendToSummary(params: {
  userId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.warn("[memory/summary] Redis absent — résumé glissant désactivé");
    return;
  }

  const redisKey = key(params.userId);

  try {
    const raw = await redis.get(redisKey);
    let messages: MessageEntry[];

    if (!raw) {
      messages = [];
    } else {
      const parsed: MessageEntry[] | string = JSON.parse(raw) as MessageEntry[] | string;
      if (typeof parsed === "string") {
        // Résumé compressé précédent — on repart d'un buffer frais avec le résumé comme contexte
        messages = [{ role: "assistant", content: `[Résumé précédent] ${parsed}` }];
      } else {
        messages = parsed;
      }
    }

    messages.push({ role: params.role, content: params.content });

    if (messages.length >= MAX_BUFFER) {
      const summary = await compress(messages);
      await redis.set(redisKey, JSON.stringify(summary), "EX", SUMMARY_TTL);
    } else {
      await redis.set(redisKey, JSON.stringify(messages), "EX", SUMMARY_TTL);
    }
  } catch (err) {
    console.warn("[memory/summary] appendToSummary échouée:", err);
  }
}

export async function getSummary(userId: string): Promise<string> {
  const redis = getRedis();
  if (!redis) return "";

  try {
    const raw = await redis.get(key(userId));
    if (!raw) return "";

    const parsed: MessageEntry[] | string = JSON.parse(raw) as MessageEntry[] | string;
    if (typeof parsed === "string") return parsed;

    return parsed
      .map((m) => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
      .join("\n");
  } catch {
    return "";
  }
}

export async function clearSummary(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key(userId));
  } catch (err) {
    console.warn("[memory/summary] clearSummary échouée:", err);
  }
}

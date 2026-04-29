import Anthropic from "@anthropic-ai/sdk";
import { getSummary } from "./conversation-summary";

const GENERIC_BRIEFING = {
  text: "Bonjour ! Aucune activité récente enregistrée. Bonne journée.",
  audioScript: "Bonjour. Aucune activité récente enregistrée. Bonne journée.",
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateBriefing(params: {
  userId: string;
  date?: Date;
}): Promise<{ text: string; audioScript: string }> {
  const date = params.date ?? new Date();
  const summary = await getSummary(params.userId);

  if (!summary) return GENERIC_BRIEFING;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return GENERIC_BRIEFING;

  const anthropic = new Anthropic({ apiKey });

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Tu es l'assistant personnel de l'utilisateur. Voici ce qu'on sait de ses activités récentes : ${summary}. Génère un briefing matinal court (max 3 paragraphes) pour le ${formatDate(date)}. Commence par les priorités, termine par une note positive. Ton : direct, utile.`,
        },
      ],
    });

    const block = res.content[0];
    const text = block.type === "text" ? block.text : "";
    if (!text) return GENERIC_BRIEFING;

    return {
      text,
      audioScript: stripMarkdown(text),
    };
  } catch (err) {
    console.warn("[memory/briefing] generateBriefing échouée:", err);
    return GENERIC_BRIEFING;
  }
}

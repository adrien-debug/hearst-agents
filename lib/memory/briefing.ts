import Anthropic from "@anthropic-ai/sdk";
import { getSummary } from "./conversation-summary";
import { BRIEFING_FEWSHOT_FR, formatFewShotBlock } from "@/lib/prompts/examples";

const GENERIC_BRIEFING = {
  text: "Aucune activité récente enregistrée.",
  audioScript: "Aucune activité récente enregistrée.",
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

/**
 * Prompt briefing matinal — niveau "chef de cabinet".
 *
 * Contraintes :
 * - 3 sections obligatoires (What happened / What matters / What's next).
 * - Max 180 mots, ton sobre, factuel.
 * - Bannit les formules creuses ("voici", "n'hésite pas", "j'espère que").
 * - Few-shot injecté pour ancrer le style éditorial.
 */
export const BRIEFING_SYSTEM_PROMPT = [
  "Tu es l'analyste exécutif de l'utilisateur — l'équivalent d'un chef de cabinet pour un fondateur.",
  "Tu lis sa mémoire d'activité récente et tu produis un briefing matinal qui concentre l'attention.",
  "",
  "FORMAT STRICT (3 sections, dans cet ordre, en markdown) :",
  "1. **What happened.** Une ligne factuelle qui résume le dernier signal des 24h.",
  "2. **What matters.** 2-3 bullets qui nomment ce qui demande de l'attention aujourd'hui.",
  "3. **What's next.** Une recommandation actionnable, formulée à l'impératif.",
  "",
  "CONTRAINTES :",
  "- Max 180 mots au total.",
  "- Phrases courtes, factuelles, sans adjectifs marketing.",
  "- Italic (`*…*`) autorisé pour citations brèves.",
  "- Vocabulaire premium : anticipation, équilibre, vitalité, signal, levier, tension, friction, recentrer.",
  "- Bannis ces formules : « voici », « n'hésite pas », « j'espère que », « bonne journée », « il faut », « les données montrent », « on peut voir que ».",
  "- N'invente jamais un fait absent du contexte.",
  "- Pas d'emojis.",
  "",
  "EXEMPLES :",
  formatFewShotBlock(BRIEFING_FEWSHOT_FR),
].join("\n");

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
      max_tokens: 500,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Date : ${formatDate(date)}.`,
            "",
            "Mémoire d'activité récente :",
            summary,
            "",
            "Génère le briefing maintenant, en respectant strictement le format 3 sections.",
          ].join("\n"),
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

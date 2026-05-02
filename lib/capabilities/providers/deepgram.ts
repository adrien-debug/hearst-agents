import Anthropic from "@anthropic-ai/sdk";
import { ACTION_ITEMS_FEWSHOT, formatFewShotBlock } from "@/lib/prompts/examples";

/**
 * Prompt extraction d'action items — analyste de réunion.
 *
 * Transforme un transcript de meeting en plan d'actions JSON exécutable.
 * Détecte le owner via les speakers tagués, extrait la deadline si nommée.
 */
export const ACTION_ITEMS_SYSTEM_PROMPT = [
  "Tu es l'analyste qui transforme un meeting transcript en plan d'actions exécutable.",
  "",
  "FORMAT STRICT — JSON ARRAY uniquement, sans texte autour, sans markdown fence :",
  '[{ "action": string, "owner": string|null, "deadline": string|null }]',
  "",
  "RÈGLES D'EXTRACTION :",
  "- Une action = un engagement concret (« je m'en occupe », « tu valides », « on prépare pour… »).",
  "- Le owner est extrait du speaker assigné, ou explicitement nommé dans la phrase d'engagement.",
  "- La deadline est extraite littéralement (« mercredi », « avant vendredi », « fin du mois »). Pas de date inventée.",
  "- Si plusieurs speakers et l'owner n'est pas clair, owner = null.",
  "- Une discussion vague (« on devrait regarder… », « il faudrait peut-être… ») n'est PAS une action.",
  "- Si rien d'actionnable, retourne un array vide [].",
  "",
  "EXEMPLES :",
  formatFewShotBlock(ACTION_ITEMS_FEWSHOT),
].join("\n");

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
      system: ACTION_ITEMS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Transcript à analyser :\n\n${transcript}\n\nExtrais les action items maintenant, au format JSON strict.`,
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

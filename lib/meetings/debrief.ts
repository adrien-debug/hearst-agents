/**
 * Meeting debrief — générateur de compte-rendu éditorial structuré.
 *
 * Auparavant cette logique était inlined dans `lib/jobs/workers/meeting-bot.ts`
 * (fonction `summarizeMeeting`) avec un prompt qui dupliquait la charte
 * éditoriale et utilisait Sonnet 4-5. Refactor en module dédié pour :
 *   - Charger la charte unifiée (composeEditorialPrompt)
 *   - Standardiser sur Sonnet 4-6 (cohérent avec le reste de l'app)
 *   - Permettre la réutilisation depuis un tool LLM (request_meeting_debrief)
 *
 * La structure de sortie reste markdown 4 sections pour préserver la
 * compatibilité avec le rendering existant (UI lit `editorialSummary`
 * du contentRef tel quel).
 */

import Anthropic from "@anthropic-ai/sdk";
import { composeEditorialPrompt } from "@/lib/editorial/charter";

export interface MeetingActionItem {
  action: string;
  owner?: string | null;
  deadline?: string | null;
}

export interface GenerateMeetingDebriefInput {
  /** Transcript brut du meeting. Cap implicite à 30k chars (slice côté impl). */
  transcript: string;
  /** Action items déjà extraits par Deepgram/Haiku — aide au cadrage. */
  actionItems: MeetingActionItem[];
  /** Optionnel : titre lisible pour cadrer le débrief. */
  title?: string;
  /** Optionnel : participants identifiés (noms ou emails). */
  participants?: string[];
}

const DEBRIEF_SYSTEM_PROMPT = composeEditorialPrompt(`
Tu es éditeur de comptes-rendus de réunion pour un dirigeant pressé. Tu transformes un transcript en débrief immédiatement actionnable.

FORMAT STRICT (4 sections markdown, dans cet ordre, sans blabla autour) :

## Contexte
Une seule phrase qui pose le sujet et nomme les participants identifiables (si non clair, écris « Participants non identifiés »).

## Décisions
Bullets factuels — uniquement les décisions explicites validées en réunion. Si aucune, écris « Aucune décision actée. »

## Actions
Bullets au format : \`- [Owner] action — deadline si nommée, sinon (à planifier).\`
Aligne-toi sur les action items pré-extraits qui te sont fournis en input. Si plusieurs owners pour la même action, sépare par /.

## Suivi
Bullets — sujets ouverts sans réponse, points à clarifier, questions parking-lot. Si aucun, écris « Aucun. »

CONTRAINTES SPÉCIFIQUES :
- Total ≤ 350 mots.
- Reste factuel : pas d'inférence sur émotions, intentions, sous-textes.
- Pas de blabla introductif ou conclusif (« voici le résumé… », « en conclusion… »).
- Si transcript vide ou inexploitable, retourne les 4 sections avec « Donnée indisponible. » dans chacune plutôt que d'inventer.
`);

const TRANSCRIPT_CAP = 30_000;

/**
 * Génère le débrief éditorial à partir du transcript + action items.
 *
 * Retourne `null` si :
 *   - transcript vide
 *   - ANTHROPIC_API_KEY absent
 *   - erreur Anthropic (logged warn)
 *
 * Le caller décide quoi faire avec null (afficher transcript brut, retry, etc.).
 */
export async function generateMeetingDebrief(
  input: GenerateMeetingDebriefInput,
): Promise<string | null> {
  if (!input.transcript.trim()) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic();
  const userPromptLines: string[] = [];

  if (input.title) {
    userPromptLines.push(`## Titre du meeting`, input.title, "");
  }
  if (input.participants && input.participants.length > 0) {
    userPromptLines.push(
      `## Participants identifiés`,
      input.participants.join(", "),
      "",
    );
  }

  userPromptLines.push(
    "## Action items pré-extraits",
    input.actionItems.length > 0
      ? input.actionItems
          .map(
            (a) =>
              `- ${a.action}${a.owner ? ` (owner: ${a.owner})` : ""}${a.deadline ? ` [deadline: ${a.deadline}]` : ""}`,
          )
          .join("\n")
      : "(aucun)",
    "",
    "## Transcript brut",
    input.transcript.slice(0, TRANSCRIPT_CAP),
  );

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: DEBRIEF_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPromptLines.join("\n") }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn(
      "[meetings/debrief] generateMeetingDebrief failed :",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export { DEBRIEF_SYSTEM_PROMPT };

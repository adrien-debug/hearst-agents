/**
 * Mission Suggestion Engine — detects when a completed run
 * is a good candidate for a recurring automation.
 */

export type MissionSuggestionType =
  | "schedule_report"
  | "schedule_research"
  | "schedule_digest";

export interface MissionSuggestion {
  type: MissionSuggestionType;
  label: string;
  scheduleHint: string;
  presetPrompt: string;
  presetName: string;
  presetSchedule: string;
}

const REPORT_PATTERNS = [
  /rapport/i,
  /report/i,
  /analyse/i,
  /étude/i,
  /synthèse/i,
  /bilan/i,
];

const RESEARCH_PATTERNS = [
  /recherche/i,
  /actualité/i,
  /veille/i,
  /news/i,
  /suivi/i,
  /monitor/i,
  /surveille/i,
];

const DIGEST_PATTERNS = [
  /résumé/i,
  /digest/i,
  /récap/i,
  /summary/i,
  /urgent/i,
  /attention/i,
];

function extractTopic(input: string): string {
  const cleaned = input
    .replace(/^(fais|fait|génère|crée|donne|montre|prépare)[\s-]*(moi|nous|leur)?\s*/i, "")
    .replace(/^(un|une|le|la|les|des|du|de la|de l')\s*/i, "")
    .replace(/^(rapport|report|analyse|étude|synthèse|recherche|veille|résumé|bilan)\s*(sur|de|du|des|d')?\s*/i, "")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getMissionSuggestions(
  input: string,
  hasAsset: boolean,
): MissionSuggestion[] {
  const suggestions: MissionSuggestion[] = [];
  const topic = extractTopic(input);

  const isReport = REPORT_PATTERNS.some((p) => p.test(input));
  const isResearch = RESEARCH_PATTERNS.some((p) => p.test(input));
  const isDigest = DIGEST_PATTERNS.some((p) => p.test(input));

  if (isReport || hasAsset) {
    suggestions.push({
      type: "schedule_report",
      label: "Planifier chaque matin",
      scheduleHint: "Tous les jours à 08:00",
      presetPrompt: input,
      presetName: `Rapport ${topic} quotidien`,
      presetSchedule: "0 8 * * *",
    });
  }

  if (isResearch) {
    suggestions.push({
      type: "schedule_research",
      label: "Créer une veille quotidienne",
      scheduleHint: "Tous les jours à 08:00",
      presetPrompt: input,
      presetName: `Veille ${topic}`,
      presetSchedule: "0 8 * * *",
    });
  }

  if (isDigest) {
    suggestions.push({
      type: "schedule_digest",
      label: "Planifier un résumé quotidien",
      scheduleHint: "Tous les jours à 08:00",
      presetPrompt: input,
      presetName: `Résumé ${topic} quotidien`,
      presetSchedule: "0 8 * * *",
    });
  }

  return suggestions;
}

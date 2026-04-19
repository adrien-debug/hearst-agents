/**
 * Tool definitions for Anthropic function calling.
 *
 * Each tool maps to a real connector action.
 * The LLM decides when to call them based on user intent.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type ToolName =
  | "get_emails"
  | "get_calendar_events"
  | "get_files"
  | "get_slack_messages";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_emails",
    description:
      "Récupère les emails récents de l'utilisateur (Gmail). " +
      "Retourne un résumé avec expéditeur, sujet, priorité, et stats (urgents, non lus, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Nombre max d'emails à retourner (défaut: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_calendar_events",
    description:
      "Récupère les événements à venir de l'agenda (Google Calendar). " +
      "Retourne titre, date, heure, lieu.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Nombre de jours à scanner (défaut: 7)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_files",
    description:
      "Récupère les fichiers récents (Google Drive). " +
      "Retourne nom, date de modification, statut partagé.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Nombre max de fichiers (défaut: 5)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_slack_messages",
    description:
      "Récupère les messages Slack récents de l'utilisateur. " +
      "Retourne expéditeur, canal, contenu, mentions.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Nombre max de messages (défaut: 10)",
        },
      },
      required: [],
    },
  },
];

export function getToolByName(name: string): Anthropic.Tool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

/**
 * Tool definitions for Anthropic function calling.
 *
 * Tools are capability-based, not provider-based.
 * The LLM never knows which provider is used behind the scenes.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type ToolName =
  | "get_messages"
  | "get_calendar_events"
  | "get_files"
  | "search_web";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_messages",
    description:
      "Récupère les messages récents de l'utilisateur depuis toutes les sources connectées (email, messagerie). " +
      "Retourne un résumé unifié avec expéditeur, sujet, source, priorité, et stats (urgents, non lus, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Nombre max de messages à retourner (défaut: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_calendar_events",
    description:
      "Récupère les événements à venir de l'agenda de l'utilisateur. " +
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
      "Récupère les fichiers récents de l'utilisateur. " +
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
    name: "search_web",
    description:
      "Recherche sur le web pour trouver des informations actuelles et pertinentes. " +
      "Utiliser pour les questions nécessitant des données récentes, des actualités, ou des recherches factuelles.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "La requête de recherche web",
        },
      },
      required: ["query"],
    },
  },
];

export function getToolByName(name: string): Anthropic.Tool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

import type { ChatOutcome, Mission, ActionStatus, Surface } from "./types";

/* ─── Intent pattern definition ─── */

interface IntentPattern {
  keywords: string[];
  surface: Surface;
  isMission: boolean;
  missionTitle: string;
  actions: { label: string; service?: string }[];
  services: string[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    keywords: ["résume", "emails", "mail", "mails"],
    surface: "inbox",
    isMission: true,
    missionTitle: "Résumer vos emails",
    actions: [
      { label: "Connexion à votre messagerie", service: "Gmail" },
      { label: "Lecture de vos emails récents", service: "Gmail" },
      { label: "Analyse du contenu", service: "Gmail" },
      { label: "Préparation du résumé" },
    ],
    services: ["Gmail"],
  },
  {
    keywords: ["réponds", "répondre", "urgents", "urgent", "réponse"],
    surface: "inbox",
    isMission: true,
    missionTitle: "Répondre aux emails urgents",
    actions: [
      { label: "Analyse de vos emails", service: "Gmail" },
      { label: "Détection des messages prioritaires", service: "Gmail" },
      { label: "Préparation des réponses" },
      { label: "Vérification avant envoi" },
    ],
    services: ["Gmail"],
  },
  {
    keywords: ["montre", "voir", "affiche", "boîte", "inbox", "email", "emails"],
    surface: "inbox",
    isMission: false,
    missionTitle: "",
    actions: [],
    services: [],
  },
  {
    keywords: ["agenda", "calendrier", "planning", "rendez-vous", "réunion", "demain"],
    surface: "calendar",
    isMission: false,
    missionTitle: "",
    actions: [],
    services: [],
  },
  {
    keywords: ["fichier", "fichiers", "document", "documents", "récents"],
    surface: "files",
    isMission: false,
    missionTitle: "",
    actions: [],
    services: [],
  },
  {
    keywords: ["tâche", "tâches", "todo", "todos", "à faire"],
    surface: "tasks",
    isMission: false,
    missionTitle: "",
    actions: [],
    services: [],
  },
  {
    keywords: ["application", "applications", "apps", "services", "connecter", "intégration", "intégrations"],
    surface: "apps",
    isMission: false,
    missionTitle: "",
    actions: [],
    services: [],
  },
  {
    keywords: ["rapport", "crypto", "marché", "signaux", "market"],
    surface: "home",
    isMission: true,
    missionTitle: "Générer votre rapport",
    actions: [
      { label: "Collecte des données de marché" },
      { label: "Analyse des tendances" },
      { label: "Rédaction du rapport" },
    ],
    services: [],
  },
  {
    keywords: ["attention", "urgent", "important", "priorité"],
    surface: "inbox",
    isMission: true,
    missionTitle: "Vérifier ce qui nécessite votre attention",
    actions: [
      { label: "Vérification de vos emails", service: "Gmail" },
      { label: "Vérification de vos messages", service: "Slack" },
      { label: "Analyse des priorités" },
      { label: "Préparation du résumé" },
    ],
    services: ["Gmail", "Slack"],
  },
];

/* ─── ID generation ─── */

let _counter = 0;
function nextId(): number {
  return ++_counter;
}

/* ─── Normalisation ─── */

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ─── Keyword-based detection ─── */

export function detectIntent(text: string): ChatOutcome {
  const lower = normalize(text);

  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.some((kw) => lower.includes(normalize(kw)));
    if (!matched) continue;

    if (pattern.isMission) {
      const n = nextId();
      const mission: Mission = {
        id: `mission-${n}`,
        title: pattern.missionTitle,
        surface: pattern.surface,
        status: "created",
        actions: pattern.actions.map((a, i) => ({
          id: `action-${n}-${i}`,
          label: a.label,
          status: "waiting" as ActionStatus,
          service: a.service,
        })),
        services: pattern.services,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return { type: "mission", mission };
    }

    return { type: "navigate", surface: pattern.surface };
  }

  return { type: "reply", content: "" };
}

/**
 * Placeholder for future LLM-based intent detection.
 * When implemented, this will call the backend to classify the intent
 * and fall back to keyword detection if the LLM call fails.
 */
export async function detectIntentWithFallback(text: string): Promise<ChatOutcome> {
  // Future: try LLM classification first
  // const llmResult = await classifyIntentViaAPI(text);
  // if (llmResult) return llmResult;
  return detectIntent(text);
}

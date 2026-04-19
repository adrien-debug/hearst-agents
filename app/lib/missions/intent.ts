import type { ChatOutcome, Mission, ActionStatus, Surface } from "./types";

/* ─── Classification result (internal) ─── */

interface Classification {
  mode: "chat" | "action" | "navigation";
  intent: string;
  confidence: number;
  surface?: Surface;
  patternIndex?: number;
}

/* ─── Intent pattern definition ─── */

interface IntentPattern {
  keywords: string[];
  surface: Surface;
  isMission: boolean;
  missionTitle: string;
  actions: { label: string; service?: string }[];
  services: string[];
}

/*
 * Order: missions (actions) first, then navigation targets.
 * Missions require action keywords.
 * Navigation requires explicit nav verbs + target keywords.
 */
const ACTION_PATTERNS: IntentPattern[] = [
  {
    keywords: ["résume", "résumer", "résumé"],
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
    keywords: ["réponds", "répondre", "réponse"],
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
    keywords: ["attention", "urgent", "urgents", "important", "priorité"],
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
];

interface NavTarget {
  keywords: string[];
  surface: Surface;
}

const NAV_TARGETS: NavTarget[] = [
  { keywords: ["inbox", "email", "emails", "mail", "mails", "boîte de réception"], surface: "inbox" },
  { keywords: ["agenda", "calendrier", "planning", "rendez-vous", "réunion"], surface: "calendar" },
  { keywords: ["fichier", "fichiers", "document", "documents"], surface: "files" },
  { keywords: ["tâche", "tâches", "todo", "todos", "à faire"], surface: "tasks" },
  { keywords: ["application", "applications", "apps", "services", "connecter", "intégration", "intégrations"], surface: "apps" },
];

const NAV_VERBS = ["ouvre", "ouvrir", "va", "aller", "montre", "affiche", "voir", "accède", "accéder"];

/* ─── ID generation ─── */

let _counter = 0;
function nextId(): number {
  return ++_counter;
}

/* ─── Normalisation ─── */

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ─── Vague / social / exploratory message guard ─── */

const VAGUE_PATTERNS = [
  /^(hello|hi|hey|salut|bonjour|coucou|yo|ok|oui|non|merci|thanks|thank you|test)\b/,
  /^(aide|help|comment|quoi|que fais[ -]tu|tu fais quoi|c'est quoi|what)\b/,
  /^(ca va|comment vas|quoi de neuf|sup)\b/,
];

const MIN_ACTIONABLE_LENGTH = 3;

function isVagueMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_ACTIONABLE_LENGTH) return true;
  const norm = normalize(trimmed);
  return VAGUE_PATTERNS.some((p) => p.test(norm));
}

/* ─── Classification engine ─── */

function classify(text: string): Classification {
  if (isVagueMessage(text)) {
    return { mode: "chat", intent: "vague", confidence: 0.9 };
  }

  const norm = normalize(text);

  for (let i = 0; i < ACTION_PATTERNS.length; i++) {
    const pattern = ACTION_PATTERNS[i];
    if (pattern.keywords.some((kw) => norm.includes(normalize(kw)))) {
      return {
        mode: "action",
        intent: pattern.missionTitle,
        confidence: 0.95,
        surface: pattern.surface,
        patternIndex: i,
      };
    }
  }

  const hasNavVerb = NAV_VERBS.some((v) => norm.includes(normalize(v)));

  for (const target of NAV_TARGETS) {
    if (target.keywords.some((kw) => norm.includes(normalize(kw)))) {
      if (hasNavVerb) {
        return { mode: "navigation", intent: `open_${target.surface}`, confidence: 1, surface: target.surface };
      }
      return { mode: "chat", intent: `inbox_overview`, confidence: 0.6, surface: target.surface };
    }
  }

  return { mode: "chat", intent: "unknown", confidence: 0.5 };
}

/* ─── Public API (returns ChatOutcome for backward compat) ─── */

export function detectIntent(text: string): ChatOutcome {
  const c = classify(text);

  if (c.mode === "action" && c.patternIndex !== undefined) {
    const pattern = ACTION_PATTERNS[c.patternIndex];
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

  if (c.mode === "navigation" && c.surface) {
    return { type: "navigate", surface: c.surface };
  }

  return { type: "reply", content: "" };
}

export { classify };

export async function detectIntentWithFallback(text: string): Promise<ChatOutcome> {
  return detectIntent(text);
}

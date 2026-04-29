/**
 * Capability Taxonomy — Single source of truth.
 *
 * Every domain, capability, keyword, tool, provider and valid agent
 * is declared here. All routing, filtering and validation code
 * must import from this module instead of maintaining local keyword lists.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";

// ── Domain ──────────────────────────────────────────────────

export type Domain =
  | "communication"
  | "productivity"
  | "finance"
  | "research"
  | "developer"
  | "design"
  | "crm"
  | "media"
  | "analysis"
  | "documents"
  | "general";

// ── Capability ──────────────────────────────────────────────

export type Capability =
  | "email.read"
  | "email.send"
  | "slack.read"
  | "slack.send"
  | "calendar.read"
  | "calendar.write"
  | "drive.read"
  | "drive.write"
  | "web.search"
  | "report.generate"
  | "data.analyze"
  | "data.export"
  | "stripe.read"
  | "stripe.write"
  | "github.read"
  | "github.write"
  | "figma.read"
  | "figma.write"
  | "crm.read"
  | "crm.write"
  | "notion.read"
  | "notion.write"
  | "schedule.create"
  | "image.generate"
  | "video.generate"
  | "code.execute"
  | "document.parse";

// ── Retrieval Mode (maps to existing delegate retrieval_mode) ──

export type RetrievalMode = "messages" | "documents" | "structured_data";

// ── Domain Entry ────────────────────────────────────────────

export interface DomainEntry {
  capabilities: Capability[];
  connectorCapabilities: ConnectorCapability[];
  providers: string[];
  tools: string[];
  validAgents: string[];
  retrievalMode: RetrievalMode | null;
  keywords: {
    fr: string[];
    en: string[];
  };
}

// ── Canonical Taxonomy ──────────────────────────────────────

export const DOMAIN_TAXONOMY: Record<Domain, DomainEntry> = {
  communication: {
    capabilities: ["email.read", "email.send", "slack.read", "slack.send"],
    connectorCapabilities: ["messaging", "messaging_send"],
    providers: ["google", "slack", "whatsapp"],
    tools: ["get_messages", "send_message", "post_message"],
    validAgents: ["KnowledgeRetriever", "Communicator"],
    retrievalMode: "messages",
    keywords: {
      fr: [
        "email", "emails", "mail", "mails", "boîte", "boite", "courrier",
        "inbox", "message", "messages", "slack",
        "écrire", "envoyer", "répondre", "correspondance",
      ],
      en: [
        "email", "emails", "mail", "inbox", "message", "messages", "slack",
        "send", "reply", "compose",
      ],
    },
  },

  productivity: {
    capabilities: ["calendar.read", "calendar.write", "drive.read", "drive.write", "notion.read", "notion.write", "schedule.create"],
    connectorCapabilities: ["calendar", "files", "automation"],
    providers: ["google", "notion"],
    tools: ["get_calendar_events", "get_files", "schedule_task", "query_database"],
    validAgents: ["KnowledgeRetriever", "Planner", "ProductivityAgent"],
    retrievalMode: "structured_data",
    keywords: {
      fr: [
        "agenda", "calendrier", "réunion", "reunion", "événement", "evenement",
        "planning", "rendez-vous", "rdv", "disponible", "créneau",
        "aujourd'hui", "demain", "cette semaine",
        "fichier", "fichiers", "document", "documents", "drive", "dossier",
        "notion",
      ],
      en: [
        "calendar", "meeting", "event", "schedule", "available", "slot",
        "today", "tomorrow", "this week",
        "file", "files", "document", "documents", "drive", "folder",
        "notion",
      ],
    },
  },

  finance: {
    capabilities: ["stripe.read", "stripe.write", "data.analyze", "data.export"],
    connectorCapabilities: ["finance", "commerce"],
    providers: ["stripe"],
    tools: ["export_excel", "analyze_data", "generate_report"],
    validAgents: ["FinanceAgent", "Analyst"],
    retrievalMode: null,
    keywords: {
      fr: [
        "crypto", "bitcoin", "ethereum", "blockchain",
        "revenue", "marché", "marche", "portfolio", "finance",
        "prix", "trading", "stripe", "paiement", "facture",
      ],
      en: [
        "crypto", "bitcoin", "ethereum", "blockchain",
        "revenue", "market", "portfolio", "finance",
        "price", "trading", "stripe", "payment", "invoice",
      ],
    },
  },

  research: {
    capabilities: ["web.search", "report.generate", "data.analyze"],
    connectorCapabilities: ["research"],
    providers: ["web", "anthropic_managed"],
    tools: ["search_web", "generate_report", "analyze_data"],
    validAgents: ["KnowledgeRetriever", "Analyst", "DocBuilder"],
    retrievalMode: null,
    keywords: {
      fr: [
        "recherche", "cherche", "actualité", "actualite", "news",
        "rapport", "analyse", "benchmark", "veille",
        "tendance", "compare", "comparaison",
        "enquête", "enquete", "étude", "etude",
        "résumé de", "resume de", "synthèse", "synthese",
        "fais-moi un", "fais moi un", "génère", "genere",
        "rédige", "redige", "prépare", "prepare",
      ],
      en: [
        "research", "search", "news", "report", "analysis", "analyze",
        "benchmark", "trend", "compare", "comparison",
        "investigate", "study", "summary", "synthesis",
        "generate", "write", "prepare",
      ],
    },
  },

  developer: {
    capabilities: ["github.read", "github.write"],
    connectorCapabilities: ["developer_tools"],
    providers: ["github", "jira"],
    tools: [],
    validAgents: ["DeveloperAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "github", "git", "commit", "pull request", "pr", "merge",
        "code", "repo", "repository", "branche", "deploy",
        "jira", "ticket", "issue",
      ],
      en: [
        "github", "git", "commit", "pull request", "pr", "merge",
        "code", "repo", "repository", "branch", "deploy",
        "jira", "ticket", "issue",
      ],
    },
  },

  design: {
    capabilities: ["figma.read", "figma.write"],
    connectorCapabilities: ["design"],
    providers: ["figma"],
    tools: [],
    validAgents: ["DesignAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "figma", "design", "maquette", "prototype", "wireframe",
        "composant", "ui", "ux", "interface",
      ],
      en: [
        "figma", "design", "mockup", "prototype", "wireframe",
        "component", "ui", "ux", "interface",
      ],
    },
  },

  crm: {
    capabilities: ["crm.read", "crm.write"],
    connectorCapabilities: ["crm"],
    providers: ["hubspot"],
    tools: [],
    validAgents: ["CRMAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "hubspot", "crm", "contact", "contacts", "client", "clients",
        "lead", "leads", "prospect", "pipeline", "deal",
      ],
      en: [
        "hubspot", "crm", "contact", "contacts", "customer", "customers",
        "lead", "leads", "prospect", "pipeline", "deal",
      ],
    },
  },

  media: {
    capabilities: ["image.generate", "video.generate"],
    connectorCapabilities: [],
    providers: ["fal_ai", "heygen", "runway"],
    tools: ["generate_image", "generate_video"],
    validAgents: ["Operator", "DocBuilder"],
    retrievalMode: null,
    keywords: {
      fr: [
        "image", "illustration", "photo", "visuel", "visuels",
        "génère une image", "crée une image", "visualise",
        "vidéo", "video", "animation", "avatar", "clip",
        "présentation animée",
      ],
      en: [
        "illustration", "visual", "visuals",
        "generate image", "create image",
        "video", "animation", "avatar", "clip",
      ],
    },
  },

  analysis: {
    capabilities: ["code.execute", "data.analyze"],
    connectorCapabilities: [],
    providers: ["e2b"],
    tools: ["execute_code", "analyze_data"],
    validAgents: ["Analyst", "Operator"],
    retrievalMode: null,
    keywords: {
      fr: [
        "exécute", "exécuter", "sandbox", "script python",
        "code python", "lance ce code", "analyse données",
        "calcul numérique", "run python",
        "calcule", "python", "javascript", "graphique", "simulation",
      ],
      en: [
        "execute code", "run code", "python script",
        "sandbox", "analyze data", "code execution", "run python",
        "javascript", "graph", "simulation",
      ],
    },
  },

  documents: {
    capabilities: ["document.parse"],
    connectorCapabilities: [],
    providers: ["llama_parse"],
    tools: ["parse_document"],
    validAgents: ["KnowledgeRetriever", "DocBuilder"],
    retrievalMode: "documents",
    keywords: {
      fr: [
        "pdf", "parse", "lis ce fichier", "extraire texte",
        "convertir pdf", "fichier pdf", "document pdf",
        "analyse ce document", "extraction",
        "extrait du document", "analyse ce pdf", "contenu du fichier",
      ],
      en: [
        "pdf", "parse", "read this file", "extract text",
        "convert pdf", "pdf file", "pdf document", "extraction",
      ],
    },
  },

  general: {
    capabilities: [],
    connectorCapabilities: [],
    providers: [],
    tools: ["search_web", "generate_report", "schedule_task"],
    validAgents: ["KnowledgeRetriever", "Analyst", "DocBuilder", "Communicator", "Operator", "Planner"],
    retrievalMode: null,
    keywords: { fr: [], en: [] },
  },
};

// ── Resolver Functions ──────────────────────────────────────

const _allDomains = Object.keys(DOMAIN_TAXONOMY) as Domain[];

// Word-boundary regex chars to escape before building a keyword pattern.
// Exported so other intent detectors (write-intent, schedule-intent…) reuse
// the same escaping rather than re-defining their own.
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strict keyword match — replaces the previous `lower.includes(kw)` which
 * matched fragments inside unrelated words ("ui" matched "qui", "git" matched
 * "previous", etc.) and broke domain routing on trivial prompts.
 *
 * Short keywords (≤ 3 chars like "ui", "ux", "git", "pr") get a tight
 * delimiter check (start/end + punctuation/whitespace). Longer keywords use
 * a standard `\b` word boundary which is robust enough.
 */
export function keywordMatches(input: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  const lower = input.toLowerCase();
  if (kw.length <= 3) {
    return new RegExp(
      `(^|[\\s.,!?;:()"'«»])${escapeRegex(kw)}($|[\\s.,!?;:()"'«»])`,
      "i",
    ).test(lower);
  }
  // For keywords ≥ 4 chars, accept an optional "s" suffix so plurals match
  // ("meeting" → "meetings", "event" → "events"). Avoids ballooning the
  // keyword lists with every plural variant.
  return new RegExp(`\\b${escapeRegex(kw)}s?\\b`, "i").test(lower);
}

/**
 * Resolve the primary domain from user message text.
 * Returns "general" if no domain-specific keywords match.
 */
export function resolveDomain(message: string): Domain {
  let bestDomain: Domain = "general";
  let bestScore = 0;

  for (const domain of _allDomains) {
    if (domain === "general") continue;
    const entry = DOMAIN_TAXONOMY[domain];
    const allKeywords = [...entry.keywords.fr, ...entry.keywords.en];

    let score = 0;
    for (const kw of allKeywords) {
      if (keywordMatches(message, kw)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

/**
 * Get all valid agent names for a given domain.
 */
export function getValidAgentsForDomain(domain: Domain): string[] {
  return DOMAIN_TAXONOMY[domain].validAgents;
}

/**
 * Check if an agent name is valid for the given domain.
 */
export function isAgentValidForDomain(agent: string, domain: Domain): boolean {
  const entry = DOMAIN_TAXONOMY[domain];
  return entry.validAgents.includes(agent) || DOMAIN_TAXONOMY.general.validAgents.includes(agent);
}

/**
 * Get the providers required for a domain.
 */
export function getProvidersForDomain(domain: Domain): string[] {
  return DOMAIN_TAXONOMY[domain].providers;
}

/**
 * Get the tools allowed for a domain.
 */
export function getToolsForDomain(domain: Domain): string[] {
  return DOMAIN_TAXONOMY[domain].tools;
}

/**
 * Resolve retrieval mode from message (replaces detectRetrievalMode in index.ts).
 */
export function resolveRetrievalMode(message: string): RetrievalMode | null {
  const domain = resolveDomain(message);
  if (domain === "communication") return "messages";

  const productivityKw = [...DOMAIN_TAXONOMY.productivity.keywords.fr, ...DOMAIN_TAXONOMY.productivity.keywords.en];
  const fileKw = productivityKw.filter((k) =>
    ["fichier", "fichiers", "document", "documents", "drive", "dossier", "file", "files", "folder"].includes(k),
  );
  if (fileKw.some((k) => keywordMatches(message, k))) return "documents";

  const calKw = productivityKw.filter((k) =>
    ["agenda", "calendrier", "réunion", "reunion", "événement", "evenement", "planning", "rendez-vous", "rdv", "disponible", "créneau", "aujourd'hui", "demain", "cette semaine", "calendar", "meeting", "event", "schedule", "today", "tomorrow", "this week"].includes(k),
  );
  if (calKw.some((k) => keywordMatches(message, k))) return "structured_data";

  return DOMAIN_TAXONOMY[domain].retrievalMode;
}

/**
 * Detect which data intents the message requires (replaces detectDataIntent).
 */
const CAL_KEYWORDS = new Set([
  "agenda", "calendrier", "réunion", "reunion", "événement", "evenement",
  "planning", "rendez-vous", "rdv", "disponible", "créneau",
  "aujourd'hui", "demain", "cette semaine",
  "calendar", "meeting", "event", "schedule", "today", "tomorrow", "this week",
]);
const GMAIL_KEYWORDS = new Set([
  "email", "emails", "mail", "mails", "boîte", "boite", "courrier",
  "inbox", "gmail", "non lu", "unread",
]);
const DRIVE_KEYWORDS = new Set([
  "fichier", "fichiers", "document", "documents", "drive", "dossier",
  "file", "files", "folder",
]);

export function resolveDataIntent(message: string): {
  needsCalendar: boolean;
  needsGmail: boolean;
  needsDrive: boolean;
} {
  const domain = resolveDomain(message);

  return {
    needsCalendar: [...CAL_KEYWORDS].some((k) => keywordMatches(message, k)) || domain === "productivity",
    needsGmail: [...GMAIL_KEYWORDS].some((k) => keywordMatches(message, k)) || domain === "communication",
    needsDrive: [...DRIVE_KEYWORDS].some((k) => keywordMatches(message, k)),
  };
}

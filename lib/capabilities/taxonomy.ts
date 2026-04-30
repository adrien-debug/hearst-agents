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
    // Communication providers — élargi au top des canaux activés via Composio
    // bulk-enable. WhatsApp/Twilio/Vonage/Discord/Teams sont managed côté
    // Composio (auth), le router peut les exposer dès qu'une auth est ACTIVE.
    providers: [
      "google", "slack", "whatsapp", "twilio", "vonage",
      "discord", "microsoftteams", "sendgrid", "mailchimp",
      "convertkit", "activecampaign", "customerio",
    ],
    tools: [
      "get_messages", "send_message", "post_message",
      "send_sms", "send_whatsapp", "send_campaign",
    ],
    validAgents: ["KnowledgeRetriever", "Communicator"],
    retrievalMode: "messages",
    keywords: {
      fr: [
        "email", "emails", "mail", "mails", "boîte", "boite", "courrier",
        "inbox", "message", "messages", "slack",
        "écrire", "envoyer", "répondre", "correspondance",
        "sms", "whatsapp", "twilio", "vonage", "discord", "teams",
        "campagne", "newsletter", "mailchimp", "sendgrid", "convertkit",
      ],
      en: [
        "email", "emails", "mail", "inbox", "message", "messages", "slack",
        "send", "reply", "compose",
        "sms", "whatsapp", "twilio", "vonage", "discord", "teams",
        "campaign", "newsletter", "mailchimp", "sendgrid", "convertkit",
      ],
    },
  },

  productivity: {
    capabilities: ["calendar.read", "calendar.write", "drive.read", "drive.write", "notion.read", "notion.write", "schedule.create"],
    connectorCapabilities: ["calendar", "files", "automation"],
    // Project mgmt + docs collab — Linear/Asana/Monday/Trello/Jira/ClickUp.
    // Airtable est listé ici (workspace data) plutôt qu'analysis pour matcher
    // l'usage métier dominant (collab + base de données).
    providers: [
      "google", "notion", "linear", "asana", "monday",
      "trello", "jira", "clickup", "airtable",
    ],
    tools: [
      "get_calendar_events", "get_files", "schedule_task", "query_database",
      "create_task", "create_issue", "list_tasks", "update_task",
    ],
    validAgents: ["KnowledgeRetriever", "Planner", "ProductivityAgent"],
    retrievalMode: "structured_data",
    keywords: {
      fr: [
        "agenda", "calendrier", "réunion", "reunion", "événement", "evenement",
        "planning", "rendez-vous", "rdv", "disponible", "créneau",
        "aujourd'hui", "demain", "cette semaine",
        "fichier", "fichiers", "document", "documents", "drive", "dossier",
        "notion",
        "tâche", "tache", "tâches", "taches", "ticket projet",
        "linear", "asana", "monday", "trello", "clickup", "airtable",
        "sprint", "backlog", "kanban",
      ],
      en: [
        "calendar", "meeting", "event", "schedule", "available", "slot",
        "today", "tomorrow", "this week",
        "file", "files", "document", "documents", "drive", "folder",
        "notion",
        "task", "tasks", "project ticket",
        "linear", "asana", "monday", "trello", "clickup", "airtable",
        "sprint", "backlog", "kanban",
      ],
    },
  },

  finance: {
    capabilities: ["stripe.read", "stripe.write", "data.analyze", "data.export"],
    connectorCapabilities: ["finance", "commerce"],
    // Stripe (payments) + comptabilité (QuickBooks, Xero) + e-commerce
    // (Shopify, WooCommerce, BigCommerce). E-commerce traité comme finance
    // car les tools pertinents sont commande/revenue/refund.
    providers: [
      "stripe", "quickbooks", "xero",
      "shopify", "woocommerce", "bigcommerce",
    ],
    tools: [
      "export_excel", "analyze_data", "generate_report",
      "list_invoices", "create_invoice", "list_orders", "refund_order",
    ],
    validAgents: ["FinanceAgent", "Analyst"],
    retrievalMode: null,
    keywords: {
      fr: [
        "crypto", "bitcoin", "ethereum", "blockchain",
        "revenue", "marché", "marche", "portfolio", "finance",
        "prix", "trading", "stripe", "paiement", "facture",
        "quickbooks", "xero", "comptabilité", "comptabilite",
        "shopify", "woocommerce", "bigcommerce", "boutique",
        "commande", "commandes", "remboursement",
      ],
      en: [
        "crypto", "bitcoin", "ethereum", "blockchain",
        "revenue", "market", "portfolio", "finance",
        "price", "trading", "stripe", "payment", "invoice",
        "quickbooks", "xero", "accounting", "bookkeeping",
        "shopify", "woocommerce", "bigcommerce", "store", "shop",
        "order", "orders", "refund",
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
    // Source control: GitHub + GitLab + Bitbucket. Jira reste ici (issue
    // tracking dev-centric) — déjà partagé avec productivity via le mot
    // "ticket"/"issue" qui est explicitement dev.
    providers: ["github", "gitlab", "bitbucket", "jira"],
    tools: [
      "list_pull_requests", "list_issues", "create_issue",
      "list_commits", "create_branch",
    ],
    validAgents: ["DeveloperAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "github", "git", "commit", "pull request", "pr", "merge",
        "code", "repo", "repository", "branche", "deploy",
        "jira", "ticket", "issue",
        "gitlab", "bitbucket", "merge request", "mr",
      ],
      en: [
        "github", "git", "commit", "pull request", "pr", "merge",
        "code", "repo", "repository", "branch", "deploy",
        "jira", "ticket", "issue",
        "gitlab", "bitbucket", "merge request", "mr",
      ],
    },
  },

  design: {
    capabilities: ["figma.read", "figma.write"],
    connectorCapabilities: ["design"],
    providers: ["figma", "canva"],
    tools: ["list_files", "create_design", "export_design"],
    validAgents: ["DesignAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "figma", "design", "maquette", "prototype", "wireframe",
        "composant", "ui", "ux", "interface",
        "canva", "template visuel",
      ],
      en: [
        "figma", "design", "mockup", "prototype", "wireframe",
        "component", "ui", "ux", "interface",
        "canva", "visual template",
      ],
    },
  },

  crm: {
    capabilities: ["crm.read", "crm.write"],
    connectorCapabilities: ["crm"],
    // Sales/Support stack: HubSpot + Salesforce/Pipedrive/Zoho/Close/Copper
    // (CRM/sales) + Zendesk/Intercom/Freshdesk/HelpScout (support tickets,
    // customer-facing → conceptuellement crm-adjacent, pas de domain support
    // distinct pour rester proche du modèle existant).
    providers: [
      "hubspot", "salesforce", "pipedrive", "zoho", "close", "copper",
      "zendesk", "intercom", "freshdesk", "helpscout",
    ],
    tools: [
      "list_contacts", "create_contact", "update_contact",
      "list_deals", "create_deal", "list_tickets", "create_ticket",
    ],
    validAgents: ["CRMAgent"],
    retrievalMode: null,
    keywords: {
      fr: [
        "hubspot", "crm", "contact", "contacts", "client", "clients",
        "lead", "leads", "prospect", "pipeline", "deal",
        "salesforce", "pipedrive", "zoho", "close.io", "copper",
        "zendesk", "intercom", "freshdesk", "helpscout",
        "support client", "ticket support",
      ],
      en: [
        "hubspot", "crm", "contact", "contacts", "customer", "customers",
        "lead", "leads", "prospect", "pipeline", "deal",
        "salesforce", "pipedrive", "zoho", "close.io", "copper",
        "zendesk", "intercom", "freshdesk", "helpscout",
        "customer support", "support ticket",
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
    // Sandbox + product analytics. Amplitude/Mixpanel/Segment exposent
    // surtout des read events qu'on agrège pour produire des reports.
    providers: ["e2b", "amplitude", "mixpanel", "segment"],
    tools: [
      "execute_code", "analyze_data",
      "query_events", "list_cohorts", "track_event",
    ],
    validAgents: ["Analyst", "Operator"],
    retrievalMode: null,
    keywords: {
      fr: [
        "exécute", "exécuter", "sandbox", "script python",
        "code python", "lance ce code", "analyse données",
        "calcul numérique", "run python",
        "calcule", "python", "javascript", "graphique", "simulation",
        "amplitude", "mixpanel", "segment",
        "métrique produit", "metrique produit", "cohorte",
      ],
      en: [
        "execute code", "run code", "python script",
        "sandbox", "analyze data", "code execution", "run python",
        "javascript", "graph", "simulation",
        "amplitude", "mixpanel", "segment",
        "product metric", "cohort", "funnel",
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

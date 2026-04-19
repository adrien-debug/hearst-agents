/**
 * Provider Requirements — maps user intent to required external providers.
 *
 * Used by the orchestrator to preflight provider readiness before execution.
 * Returns empty array when no external provider is needed.
 */

interface ProviderRequirement {
  capability: string;
  providers: string[];
  keywords: string[];
  userMessage: string;
}

const REQUIREMENTS: ProviderRequirement[] = [
  {
    capability: "messaging",
    providers: ["google", "slack"],
    keywords: [
      "email", "emails", "mail", "mails", "inbox", "boîte", "boite",
      "message", "messages", "courrier", "slack",
    ],
    userMessage: "Aucun service de messagerie connecté. Connectez Gmail ou Slack dans Applications pour accéder à vos messages.",
  },
  {
    capability: "calendar",
    providers: ["google"],
    keywords: [
      "agenda", "calendrier", "réunion", "reunion", "événement", "evenement",
      "planning", "rendez-vous", "rdv", "meeting",
    ],
    userMessage: "Google n'est pas connecté. Connectez votre compte Google dans Applications pour accéder à votre agenda.",
  },
  {
    capability: "files",
    providers: ["google"],
    keywords: [
      "fichier", "fichiers", "document", "documents", "drive", "dossier",
    ],
    userMessage: "Google n'est pas connecté. Connectez votre compte Google dans Applications pour accéder à vos fichiers.",
  },
];

export interface ProviderRequirementResult {
  capability: string;
  providers: string[];
  userMessage: string;
}

export function getRequiredProvidersForInput(input: string): ProviderRequirementResult | null {
  const lower = input.toLowerCase();

  for (const req of REQUIREMENTS) {
    if (req.keywords.some((k) => lower.includes(k))) {
      return {
        capability: req.capability,
        providers: req.providers,
        userMessage: req.userMessage,
      };
    }
  }

  return null;
}

export function getBlockedReasonForProviders(providers: string[]): string {
  const names = providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (names.length === 1) {
    return `${names[0]} is not connected`;
  }
  return `${names.join(" or ")} is not connected`;
}

/**
 * Source unique pour décrire les apps Composio connectées de l'utilisateur
 * dans les system prompts (chat orchestre + voice OpenAI Realtime).
 *
 * Avant ce module : chat et voice avaient deux blocs textuels différents,
 * voice était hardcodé statique → drift, hallucinations, agents qui niaient
 * avoir accès à des services réellement connectés (cf commit d9b4a42).
 *
 * Maintenant : 1 seul builder. Toute évolution future (nouveau provider,
 * changement de wording, règle anti-hallucination renforcée) se fait ici
 * et propage aux deux chemins.
 */

export type AgentChannel = "chat" | "voice";

interface ConnectedAppsContextOpts {
  /** Apps Composio actives, slugs lowercase (ex: ["gmail","slack","stripe"]). */
  connectedApps: ReadonlyArray<string>;
  /** Canal d'invocation — module phrasé légèrement différent (oral vs textuel). */
  channel: AgentChannel;
  /** Total tools disponibles (Composio + native). Optionnel, ajouté au prompt si fourni. */
  totalTools?: number;
}

/**
 * Phrase d'introduction éditoriale qui annonce concrètement les apps
 * disponibles. Évite la formulation générique "tu as accès aux apps connectées"
 * qui poussait le LLM à inventer ou à nier.
 */
export function buildConnectedAppsContext(opts: ConnectedAppsContextOpts): string {
  const { connectedApps, channel, totalTools } = opts;

  if (connectedApps.length === 0) {
    return channel === "voice"
      ? "L'utilisateur n'a aucune app tierce connectée pour le moment. Si on te demande Gmail/Slack/etc, dis-lui de les connecter dans /apps avant."
      : "Aucune app tierce n'est connectée pour ce tour. Si l'utilisateur veut une action sur Gmail, Slack ou autre, dis-lui d'aller connecter le service dans /apps.";
  }

  const appsLine = connectedApps.join(", ");
  const totalSuffix = totalTools && totalTools > 0 ? ` (${totalTools} actions au total)` : "";

  if (channel === "voice") {
    return `L'utilisateur a ${connectedApps.length} apps connectées${totalSuffix} : ${appsLine}. N'invente pas d'autres services — si on te demande Notion ou GitHub par exemple et qu'ils ne sont pas dans cette liste, dis-lui qu'il faut d'abord les connecter dans /apps.`;
  }

  return `Apps connectées de l'utilisateur${totalSuffix} : ${appsLine}. N'évoque jamais une action sur un service hors de cette liste sans avoir d'abord proposé à l'utilisateur de le connecter via /apps.`;
}

/**
 * Règle anti-hallucination de slug — partagée chat + voice. Le LLM a
 * tendance à inventer des slugs qu'il connaît de son entraînement (ex:
 * GMAIL_GET_EMAILS au lieu de GMAIL_FETCH_EMAILS). Cette règle l'oblige à
 * s'en tenir à la liste injectée. Combinée avec SLUG_ALIASES côté backend
 * (lib/connectors/composio/client.ts) en cas d'erreur résiduelle.
 */
export function buildSlugStrictnessRule(): string {
  return "⚠️ Règle absolue : utilise UNIQUEMENT les slugs d'outils explicitement listés/exposés. N'invente JAMAIS un slug même si tu en connais un similaire. Si l'action n'existe pas dans tes outils, dis-le à l'utilisateur plutôt que d'inventer.";
}

/**
 * Extrait les slugs d'apps depuis une liste de tool names Composio
 * (préfixe avant "_"). Utilisé pour passer connectedApps à
 * buildConnectedAppsContext depuis du code qui n'a que les tool names.
 *
 * Ex: ["GMAIL_FETCH_EMAILS","SLACK_LIST_CHANNELS"] → ["gmail","slack"]
 */
export function extractAppsFromToolNames(toolNames: ReadonlyArray<string>): string[] {
  return Array.from(
    new Set(
      toolNames
        .map((n) => n.split("_")[0]?.toLowerCase())
        .filter((s): s is string => Boolean(s)),
    ),
  ).sort();
}

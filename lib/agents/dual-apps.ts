/**
 * Dual-app guidance — détecte les apps connectées qui se chevauchent
 * fonctionnellement (ex. linear + jira pour les tâches) et produit un bloc
 * d'instruction injectable dans le system prompt.
 *
 * Pourquoi : la règle 5 du system prompt impose au LLM d'utiliser EXCLUSIVEMENT
 * l'app nommée par l'utilisateur. Mais si l'utilisateur dit juste « crée une
 * tâche pour Marc » sans préciser, et qu'il a Linear + Jira connectés, le LLM
 * peut choisir au hasard — comportement imprévisible.
 *
 * Avec ce helper, on lui demande de DEMANDER à l'utilisateur quelle app
 * utiliser plutôt que de trancher arbitrairement.
 */

/**
 * Groupes d'apps fonctionnellement équivalentes. Clé = catégorie lisible,
 * valeur = liste de slugs Composio (lowercase).
 */
export const DUAL_APP_GROUPS: Record<string, ReadonlyArray<string>> = {
  tâches: ["linear", "jira", "asana", "trello", "clickup", "monday"],
  communication: ["slack", "teams", "discord", "mattermost"],
  documentation: ["notion", "confluence", "googledrive", "dropbox"],
  code: ["github", "gitlab", "bitbucket"],
  crm: ["hubspot", "salesforce", "pipedrive", "attio"],
  email: ["gmail", "outlook"],
  agenda: ["googlecalendar", "outlookcalendar"],
};

export interface DualAppConflict {
  category: string;
  apps: string[];
}

/**
 * Pour chaque catégorie, retourne les apps connectées qui s'y trouvent
 * SI au moins 2 sont connectées dans la catégorie. Sinon skip.
 */
export function detectDualAppConflicts(
  connectedApps: ReadonlyArray<string>,
): DualAppConflict[] {
  const lowercased = new Set(connectedApps.map((a) => a.toLowerCase()));
  const conflicts: DualAppConflict[] = [];
  for (const [category, members] of Object.entries(DUAL_APP_GROUPS)) {
    const hits = members.filter((m) => lowercased.has(m));
    if (hits.length >= 2) {
      conflicts.push({ category, apps: hits });
    }
  }
  return conflicts;
}

/**
 * Construit le bloc d'instruction à injecter dans le system prompt.
 * Retourne `null` si aucun conflit (pas de bloc à ajouter).
 */
export function buildDualAppGuidance(
  connectedApps: ReadonlyArray<string>,
): string | null {
  const conflicts = detectDualAppConflicts(connectedApps);
  if (conflicts.length === 0) return null;

  const lines = [
    "DUAL-APPS CONNECTÉES — l'utilisateur a plusieurs apps dans la même catégorie :",
  ];
  for (const c of conflicts) {
    lines.push(`- ${c.category} : ${c.apps.join(", ")}`);
  }
  lines.push(
    "",
    "Si l'utilisateur demande une action sur l'une de ces catégories sans nommer l'app explicitement (ex. « crée une tâche pour Marc » sans dire Linear ni Jira), DEMANDE-lui laquelle utiliser. Ne tranche pas au hasard. La règle 5 (app exclusive) reste prioritaire — si l'app est nommée, suis-la.",
  );
  return lines.join("\n");
}

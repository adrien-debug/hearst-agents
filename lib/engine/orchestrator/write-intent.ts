/**
 * Write-intent detection.
 *
 * The capability router resolves messages with words like "envoyer",
 * "envoie", "send" into the `communication` domain with
 * `retrievalMode: "messages"`. That's correct for *reading* messages
 * ("résume mes emails non lus") but catastrophically wrong for *sending*
 * ("envoie un Slack à Bob") — the orchestrator short-circuits into the
 * synthetic retrieval path (legacy Google-only data fetcher) and the
 * request never reaches the AI pipeline where Composio tools live.
 *
 * `isWriteIntent()` flags messages that ask the agent to perform a
 * write/destructive action so the orchestrator can skip the retrieval
 * short-circuit and route them through the agentic AI pipeline instead.
 */

const WRITE_VERBS_FR = [
  "envoie", "envoies", "envoyez", "envoyer", "envoyé", "renvoie", "renvoyer",
  "réponds", "répondre", "réponse à", "transfère", "transférer", "transfert",
  "crée", "créer", "créé", "créée",
  "supprime", "supprimer", "supprimé", "efface", "effacer",
  "modifie", "modifier", "modifié", "édite", "édit", "éditer", "mets à jour",
  "envoie-lui", "envoie-leur", "envoyez-lui",
  "publie", "publier", "poster", "poste",
  "archive", "archiver",
  "déplace", "déplacer",
  "ajoute", "ajouter",
  "écris", "écrire",
  "rédige et envoie",
  "planifie", "planifier",
  "annule", "annuler", "annule la",
] as const;

const WRITE_VERBS_EN = [
  "send", "sends", "sent",
  "reply", "replies", "replied", "respond", "respond to",
  "forward", "forwards", "forwarded",
  "create", "creates", "created", "make a",
  "delete", "deletes", "deleted", "remove", "removes",
  "update", "updates", "updated", "edit", "modify",
  "post", "posts", "posted", "publish", "publishes",
  "archive", "archives", "archived",
  "move", "moves", "moved",
  "add", "adds", "added",
  "schedule", "scheduled", "schedules",
  "cancel", "cancels", "cancelled",
  "write and send", "compose and send",
] as const;

// Patterns that look like a request to read, not write — short-circuit
// to false even if a write verb is also present (e.g., "résume les emails
// que j'ai envoyés hier").
const READ_HEDGES_FR = [
  "résume", "résumer", "résumé",
  "liste", "lister", "list",
  "trouve", "trouver", "cherche", "chercher",
  "montre-moi", "montrer", "affiche",
  "qui m'a envoyé", "qui a envoyé",
  "que j'ai envoyé", "que j'ai envoyée", "que j'ai envoyés", "que j'ai envoyées",
  "ai-je", "j'ai reçu", "ai-je reçu",
  "compte", "combien",
] as const;

const READ_HEDGES_EN = [
  "summarize", "summary", "list", "find", "search",
  "show me", "who sent", "who emailed",
  "have i", "did i", "how many",
] as const;

export function isWriteIntent(message: string): boolean {
  const lower = message.toLowerCase();

  // Read-hedges win — a message starting with "résume" is always read,
  // even if it mentions "envoyé" inside.
  for (const hedge of [...READ_HEDGES_FR, ...READ_HEDGES_EN]) {
    if (lower.includes(hedge)) return false;
  }

  for (const verb of [...WRITE_VERBS_FR, ...WRITE_VERBS_EN]) {
    // Word-boundary match for short verbs to avoid false positives
    // ("send" inside "sender"). Multi-word patterns get a substring match.
    if (verb.includes(" ")) {
      if (lower.includes(verb)) return true;
    } else {
      const pattern = new RegExp(`(^|\\s|[.,!?;:])${escapeRegex(verb)}($|\\s|[.,!?;:])`, "i");
      if (pattern.test(lower)) return true;
    }
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

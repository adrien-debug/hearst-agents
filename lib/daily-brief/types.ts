/**
 * Personal CIA Briefing (vague 9, action #2) — types canoniques.
 *
 * Le Daily Brief est un PDF éditorial 2 pages signé par l'agent qui
 * synthétise l'activité du user à travers ses 5 sources principales :
 *  - Emails (24h)
 *  - Slack DMs / messages récents (4h)
 *  - Agenda du jour (Google Calendar)
 *  - GitHub PRs (7 derniers jours)
 *  - Linear issues (7 derniers jours)
 *
 * Le pipeline est totalement fail-soft : si une source n'est pas connectée
 * ou échoue, on continue avec les autres et on indique dans `sources` quelles
 * ont contribué et lesquelles ont planté.
 */

export interface DailyBriefEmailItem {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
}

export interface DailyBriefSlackItem {
  id: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
}

export interface DailyBriefCalendarItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  attendees: string[];
  location: string | null;
}

export interface DailyBriefGithubItem {
  id: string;
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "draft" | "unknown";
  repo: string;
  author: string;
  url: string;
  updatedAt: string | null;
}

export interface DailyBriefLinearItem {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number | null;
  assignee: string | null;
  url: string | null;
  updatedAt: string | null;
}

/**
 * Bundle de données brutes assemblé pour générer le PDF. Chaque liste peut
 * être vide (source pas connectée ou pas de signal) — c'est attendu.
 *
 * `extras` regroupe les apps connectées hors les 5 hardcodées ci-dessus
 * (Notion, Jira, HubSpot, Asana, Trello, etc.). Le narrator les évoque
 * dans la prose mais elles ne sont pas rendues comme sections dédiées
 * dans le PDF — juste agrégées.
 */
export interface DailyBriefData {
  emails: DailyBriefEmailItem[];
  slack: DailyBriefSlackItem[];
  calendar: DailyBriefCalendarItem[];
  github: DailyBriefGithubItem[];
  linear: DailyBriefLinearItem[];
  /** Sources connectées additionnelles via Composio (Notion, Jira, HubSpot…). */
  extras: import("./extras-providers").ExtraSource[];
  /** Sources contributrices ; suffixé `:error` quand le fetch a échoué. */
  sources: string[];
  /** Timestamp d'assemblage (epoch ms). */
  generatedAt: number;
  /** ISO date YYYY-MM-DD du brief. */
  targetDate: string;
}

/**
 * Output du LLM narrator — 4 sections éditoriales prêtes à rendre dans le
 * PDF. Le narrator ne touche pas aux chiffres bruts ; il tisse une prose
 * sobre qui contextualise les signaux.
 */
export interface DailyBriefNarration {
  /** Lead 1-2 phrases — la une de la matinée. */
  lead: string;
  /** Section "Personnes" : qui attend quoi de toi aujourd'hui. */
  people: string;
  /** Section "Décisions" : ce qu'il faut trancher / prioriser. */
  decisions: string;
  /** Section "Signaux" : faits saillants (PRs bloquantes, issues critiques, anomalies). */
  signals: string;
  /** Coût Sonnet réel (en USD), reporté pour metrics. */
  costUsd: number;
}

/** Métadonnées d'un asset Daily Brief persisté. */
export interface DailyBriefAssetMeta {
  /** Nombre total de signaux ingérés. */
  totalItems: number;
  /** Sources contributrices. */
  sources: string[];
  /** ISO date YYYY-MM-DD. */
  targetDate: string;
  /** URL signée du PDF (expire après TTL configuré côté storage). */
  pdfUrl: string | null;
  /** Storage key R2 (clé absolue dans le bucket). */
  storageKey: string | null;
  /** Taille du PDF (bytes). */
  pdfSizeBytes: number | null;
}

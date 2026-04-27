/**
 * Schedule-intent detection — runs BEFORE the LLM so the orchestrator can
 * inject a forcing instruction into the agent prompt. Without this hint, the
 * model treats "résume mes emails tous les matins à 8h" as a one-shot
 * retrieval and skips the `create_scheduled_mission` tool entirely.
 *
 * We deliberately accept some false positives at the detector level and let
 * the model + the preview/confirm protocol filter — better to over-suggest
 * the schedule tool than to silently skip recurring requests.
 */

const RECURRING_PATTERNS = [
  // FR
  /tous\s+les\s+(matins?|soirs?|jours?|midis?|lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?|semaines?|mois)/i,
  /chaque\s+(matin|soir|jour|midi|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|mois)/i,
  /toutes?\s+les\s+(\d+\s+)?(minutes?|heures?|jours?|semaines?|mois)/i,
  /du\s+lundi\s+au\s+vendredi/i,
  /jours?\s+ouvr[ée]s?/i,
  /\brappelle[\s-]moi\s+(chaque|tous)/i,
  /\bplanifie[rz]?\b/i,
  // EN
  /every\s+(morning|evening|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|hour|\d+\s+(minutes?|hours?|days?))/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bmonthly\b/i,
  /\bweekdays?\b/i,
  /every\s+\d+\s+(minutes?|hours?|days?|weeks?)/i,
  /\bschedule\s+(a|me|this|that|the)\b/i,
];

// Negative override — single-shot wording ("demain à 14h", "une fois")
const ONE_SHOT_PATTERNS = [
  /\bune\s+fois\b/i,
  /^just\s+once\b/i,
  /\bdemain\s+à\s+\d/i,
  /^tomorrow\s+at\b/i,
];

export function isScheduleIntent(message: string): boolean {
  const m = message.toLowerCase();

  // Single-shot wording wins — "rappelle-moi demain à 14h" must NOT trigger
  // a recurring mission.
  if (ONE_SHOT_PATTERNS.some((p) => p.test(m))) return false;

  return RECURRING_PATTERNS.some((p) => p.test(m));
}

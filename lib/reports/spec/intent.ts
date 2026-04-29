/**
 * Détecteur d'intent "report" — heuristique FR/EN.
 *
 * Sert au routeur de l'orchestrator pour décider si on injecte le tool
 * `propose_report_spec` ou si on l'exclut (économie de tokens dans le
 * system prompt). Pas de magic ML — juste keyword matching positif et
 * exclusion des faux positifs (ex. "rapport de bug" ≠ report business).
 */

const REPORT_KEYWORDS = [
  // FR — verbes déclencheurs
  /\brapport(s)?\b(?!\s+de\s+bug)/i,
  /\bcockpit\b/i,
  /\btableau\s+de\s+bord\b/i,
  /\bsynth[èe]se\b/i,          // "synthèse mensuelle", "synthèse hebdo", "synthèse" seul
  /\bvue\s+d['']ensemble\b/i,
  /\bbilan\b/i,                 // "bilan trimestriel", "bilan" seul
  /\b(KPI|kpis)\b/,
  /\bdashboard\b/i,
  /\b360\b/,                    // "Customer 360", "vue 360"
  /\banalyse\b/i,               // "analyse du P&L", "analyse de la vélocité"
  /\bP&L\b/i,                   // "P&L mensuel", "mon P&L"
  /\bmontre(?:z)?[-\s]moi\b/i, // "montre-moi les ventes", "montrez-moi le cockpit"
  /\bgén[eè]re\s+(?:un|une|le|la|mon|ma)\s+rapport\b/i, // "génère un rapport"
  /\bgén[eè]re\s+(?:un|une|le|la|mon|ma)\s+cockpit\b/i,
  // Noms du catalogue (9 rapports prédéfinis)
  /\bfounder\s+cockpit\b/i,
  /\bcustomer\s+360\b/i,
  /\bdeal[- ]to[- ]cash\b/i,
  /\bfinancial\s+p&l\b/i,
  /\bproduct\s+analytics\b/i,
  /\bsupport\s+health\b/i,
  /\bengineering\s+velocity\b/i,
  /\bmarketing\s+(aarrr|funnel)\b/i,
  /\bhr\s+(people|report)\b/i,
  /\bpeople\s+report\b/i,
  /\bv[eé]locit[eé]\b/i,         // "vélocité engineering"
  /\brunway\b/i,                   // "mon runway"
  /\bm(?:r|r+)r\b/i,             // "MRR", "ARR"
  // EN
  /\breport\b(?!\s+(a\s+)?bug)/i,
  /\boverview\b/i,
  /\bsummary\s+(report|view|of)\b/i,
  /\bshow\s+me\s+(my|the)\b/i,   // "show me my metrics"
  /\bgive\s+me\s+(a|an|my|the)\s+report\b/i,
];

const NEGATIVE_KEYWORDS = [
  /\brapporter?\b\s+(à|au|aux)\b/i, // "rapporter à quelqu'un" — verb usage
  /\bse\s+rapporter\b/i,
  /\bsignal(er|é)\b/i, // "signaler un bug"
];

export interface ReportIntentResult {
  isReport: boolean;
  /** Mots/phrases qui ont matché (utile pour debug + observabilité). */
  matched: string[];
}

export function detectReportIntent(message: string): ReportIntentResult {
  if (!message || message.length === 0) {
    return { isReport: false, matched: [] };
  }

  const matched: string[] = [];
  for (const pattern of REPORT_KEYWORDS) {
    const m = message.match(pattern);
    if (m) matched.push(m[0]);
  }

  if (matched.length === 0) {
    return { isReport: false, matched: [] };
  }

  // Faux positifs : si un negative keyword matche aussi, on annule
  for (const neg of NEGATIVE_KEYWORDS) {
    if (neg.test(message)) {
      return { isReport: false, matched: [] };
    }
  }

  return { isReport: true, matched };
}

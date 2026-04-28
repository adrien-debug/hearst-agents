/**
 * Détecteur d'intent "report" — heuristique FR/EN.
 *
 * Sert au routeur de l'orchestrator pour décider si on injecte le tool
 * `propose_report_spec` ou si on l'exclut (économie de tokens dans le
 * system prompt). Pas de magic ML — juste keyword matching positif et
 * exclusion des faux positifs (ex. "rapport de bug" ≠ report business).
 */

const REPORT_KEYWORDS = [
  // FR
  /\brapport(s)?\b(?!\s+de\s+bug)/i,
  /\bcockpit\b/i,
  /\btableau\s+de\s+bord\b/i,
  /\bsynth[èe]se\s+(mensuelle|hebdo|quotidienne|trimestrielle)/i,
  /\bvue\s+d['']ensemble\b/i,
  /\bbilan\s+(mensuel|hebdo|trimestriel|annuel)/i,
  /\b(KPI|kpis)\b/,
  /\bdashboard\b/i,
  /\b360\b/, // "Customer 360", "vue 360"
  // EN
  /\breport\b(?!\s+(a\s+)?bug)/i,
  /\boverview\b/i,
  /\bsummary\s+(report|view|of)/i,
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

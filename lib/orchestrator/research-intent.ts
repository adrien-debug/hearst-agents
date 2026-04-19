/**
 * Research Intent Classifier — deterministic pattern matching.
 *
 * Detects when user input requires web search / external research,
 * and when output should become a persistent asset (report).
 */

const RESEARCH_PATTERNS = [
  "recherche", "research", "cherche",
  "actualité", "actualite", "news",
  "rapport", "report",
  "analyse", "analyze", "analysis",
  "benchmark", "veille",
  "bitcoin", "crypto", "ethereum", "blockchain",
  "market", "marché", "marche",
  "tendance", "trend",
  "compare", "comparaison", "comparison",
  "enquête", "enquete", "investigate",
  "étude", "etude", "study",
  "résumé de", "resume de", "summary",
  "what is happening", "que se passe",
  "dernières nouvelles", "latest",
];

const REPORT_PATTERNS = [
  "rapport", "report",
  "analyse", "analysis",
  "étude", "etude", "study",
  "benchmark",
  "document",
  "synthèse", "synthese", "synthesis",
  "résumé", "resume", "summary",
  "brief", "briefing",
  "veille",
  "fais-moi un", "fais moi un",
  "génère", "genere", "generate",
  "rédige", "redige", "write",
  "prépare", "prepare",
];

export function isResearchIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return RESEARCH_PATTERNS.some((p) => lower.includes(p));
}

export function isReportIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return REPORT_PATTERNS.some((p) => lower.includes(p));
}

export function extractResearchQuery(input: string): string {
  return input
    .replace(/^(fais[- ]moi un (rapport|résumé|document|analyse)\s+(sur|de|du|des|à propos de)\s*)/i, "")
    .replace(/^(recherche\s+(sur|de|du|des)\s*)/i, "")
    .replace(/^(actualit[ée]s?\s+(sur|de|du|des)\s*)/i, "")
    .trim() || input;
}

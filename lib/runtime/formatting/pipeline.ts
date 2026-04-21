/**
 * Output Formatting Pipeline — Premium writing system.
 *
 * Transforms raw orchestrator output into structured, high-quality deliverables.
 * Three tiers: message (concise), brief (structured), report (executive).
 *
 * This module is pure data — no UI rendering.
 */

// ── Output tiers ────────────────────────────────────────────

export type OutputTier = "message" | "brief" | "report";
export type OutputTone = "direct" | "structured" | "executive";
export type OutputFormat = "plain" | "markdown" | "rich";

export interface OutputQualityProfile {
  tier: OutputTier;
  maxLength: number;
  tone: OutputTone;
  formatting: OutputFormat;
  signOff: boolean;
}

export const OUTPUT_PROFILES: Record<OutputTier, OutputQualityProfile> = {
  message: {
    tier: "message",
    maxLength: 500,
    tone: "direct",
    formatting: "plain",
    signOff: false,
  },
  brief: {
    tier: "brief",
    maxLength: 2000,
    tone: "structured",
    formatting: "markdown",
    signOff: false,
  },
  report: {
    tier: "report",
    maxLength: 10000,
    tone: "executive",
    formatting: "rich",
    signOff: true,
  },
};

// ── Formatted output ────────────────────────────────────────

export interface FormattedSection {
  heading?: string;
  body: string;
}

export interface FormattedOutput {
  title: string;
  summary: string;
  sections: FormattedSection[];
  tier: OutputTier;
  tone: OutputTone;
  wordCount: number;
  truncated: boolean;
}

// ── Tier detection ──────────────────────────────────────────

const REPORT_PATTERNS = /\b(rapport|report|analyse complète|full analysis|étude|bilan)\b/i;
const BRIEF_PATTERNS = /\b(résumé|brief|synthèse|summary|récap|recap|overview)\b/i;

export function detectOutputTier(intent: string): OutputTier {
  if (REPORT_PATTERNS.test(intent)) return "report";
  if (BRIEF_PATTERNS.test(intent)) return "brief";
  return "message";
}

// ── Formatting pipeline ─────────────────────────────────────

export function formatOutput(rawContent: string, tier: OutputTier): FormattedOutput {
  const profile = OUTPUT_PROFILES[tier];
  const truncated = rawContent.length > profile.maxLength;
  const content = truncated ? rawContent.slice(0, profile.maxLength) : rawContent;

  const sections = extractSections(content, tier);
  const title = deriveTitle(content, tier);
  const summary = deriveSummary(content, tier);

  return {
    title,
    summary,
    sections,
    tier,
    tone: profile.tone,
    wordCount: content.split(/\s+/).length,
    truncated,
  };
}

// ── Section extraction ──────────────────────────────────────

function extractSections(content: string, tier: OutputTier): FormattedSection[] {
  if (tier === "message") {
    return [{ body: content.trim() }];
  }

  // Split on markdown headings or double newlines for structured content
  const parts = content.split(/\n#{1,3}\s+/);

  if (parts.length <= 1) {
    const paragraphs = content.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length <= 1) {
      return [{ body: content.trim() }];
    }
    return paragraphs.map((p) => ({ body: p.trim() }));
  }

  return parts.map((part, i) => {
    const lines = part.trim().split("\n");
    if (i === 0 && !content.startsWith("#")) {
      return { body: part.trim() };
    }
    return {
      heading: lines[0]?.trim(),
      body: lines.slice(1).join("\n").trim(),
    };
  }).filter((s) => s.body.length > 0);
}

function deriveTitle(content: string, tier: OutputTier): string {
  if (tier === "message") return "";

  const firstLine = content.split("\n")[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/^#+\s*/, "");
  if (cleaned.length > 0 && cleaned.length < 120) return cleaned;

  return tier === "report" ? "Rapport" : "Synthèse";
}

function deriveSummary(content: string, tier: OutputTier): string {
  if (tier === "message") return content.slice(0, 200).trim();

  const firstParagraph = content.split(/\n\n/)[0]?.trim() ?? "";
  const cleaned = firstParagraph.replace(/^#+\s*.*\n/, "").trim();
  return cleaned.slice(0, 300);
}

// ── Tone prompt fragments (for orchestrator injection) ──────

export const TONE_PROMPTS: Record<OutputTone, string> = {
  direct: "Concis. Pas de fluff. Droit au point. Professionnel naturel.",
  structured: "Sections claires. Bullet points. Chiffres en premier. Pas de narration.",
  executive: "Résumé exécutif d'abord, détails après. Données sourcées. Structure formelle.",
};

export function getTonePromptForTier(tier: OutputTier): string {
  return TONE_PROMPTS[OUTPUT_PROFILES[tier].tone];
}

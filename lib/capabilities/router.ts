/**
 * Capability Router — Resolves a user message into a validated
 * capability scope before any execution happens.
 *
 * This is the single entry point for domain/capability resolution
 * in the public chat path. It replaces the dispersed heuristics
 * in execution-mode-selector, detectRetrievalMode, detectDataIntent,
 * inferToolContext, and getRequiredProvidersForInput.
 */

import {
  resolveDomain,
  resolveRetrievalMode,
  resolveDataIntent,
  isAgentValidForDomain,
  DOMAIN_TAXONOMY,
  type Domain,
  type Capability,
  type RetrievalMode,
} from "./taxonomy";
import type { ToolContext } from "@/lib/tools/types";

// ── Capability Scope ────────────────────────────────────────

export interface CapabilityScope {
  domain: Domain;
  capabilities: Capability[];
  providers: string[];
  allowedTools: string[];
  validAgents: string[];
  retrievalMode: RetrievalMode | null;
  toolContext: ToolContext;
  needsProviderData: {
    calendar: boolean;
    gmail: boolean;
    drive: boolean;
  };
}

// ── Domain → ToolContext mapping ────────────────────────────

const DOMAIN_TO_TOOL_CONTEXT: Record<Domain, ToolContext> = {
  communication: "inbox",
  productivity: "calendar",
  finance: "finance",
  research: "research",
  developer: "general",
  design: "general",
  crm: "general",
  general: "general",
};

// ── Router ──────────────────────────────────────────────────

/**
 * Resolve a user message into a full capability scope.
 * Surface override: if the user is on a specific surface (inbox, calendar, files),
 * that takes priority over keyword detection.
 */
export function resolveCapabilityScope(
  message: string,
  surface?: string,
): CapabilityScope {
  let domain: Domain;

  if (surface && surface !== "home") {
    domain = surfaceToDomain(surface);
  } else {
    domain = resolveDomain(message);
  }

  const entry = DOMAIN_TAXONOMY[domain];
  const retrievalMode = resolveRetrievalMode(message);

  let toolContext: ToolContext = DOMAIN_TO_TOOL_CONTEXT[domain];
  if (surface && ["inbox", "calendar", "files"].includes(surface)) {
    toolContext = surface as ToolContext;
  }

  const dataIntent = resolveDataIntent(message);

  return {
    domain,
    capabilities: entry.capabilities,
    providers: entry.providers,
    allowedTools: entry.tools,
    validAgents: entry.validAgents,
    retrievalMode,
    toolContext,
    needsProviderData: {
      calendar: dataIntent.needsCalendar,
      gmail: dataIntent.needsGmail,
      drive: dataIntent.needsDrive,
    },
  };
}

/**
 * Validate that an agent proposed by the planner is allowed for the current scope.
 */
export function validateAgentForScope(agent: string, scope: CapabilityScope): {
  valid: boolean;
  reason?: string;
} {
  if (isAgentValidForDomain(agent, scope.domain)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Agent "${agent}" is not valid for domain "${scope.domain}". Valid agents: ${scope.validAgents.join(", ")}`,
  };
}

/**
 * Check if the scope requires providers that may need preflight.
 */
export function scopeRequiresProviders(scope: CapabilityScope): boolean {
  return scope.providers.length > 0 && scope.domain !== "general" && scope.domain !== "research";
}

// Trivial / chit-chat patterns that must NEVER trigger Google data fetch —
// running 3 round-trips for "Bonjour" or "Hello, can you help me?" wasted
// 6-9s of latency and caused over-fetch on every benign prompt.
const CHIT_CHAT_PATTERNS = [
  /^\s*(bonjour|salut|hey|hello|hi|hola|coucou|merci|thanks?|ok|d'accord|ouais|oui|non|nope)\s*[!?.…]*\s*$/i,
  /^\s*(comment\s+(ça\s+va|tu\s+vas)|how\s+are\s+you|how'?s\s+it\s+going)/i,
  /^\s*(qui\s+es-tu|who\s+are\s+you|tu\s+es\s+(qui|quoi)|what\s+are\s+you)/i,
  /^\s*(que\s+peux-tu\s+faire|what\s+can\s+you\s+do|capabilities)/i,
  /^\s*(traduis|translate)\b/i,
  /^\s*(quelle\s+heure|what\s+time)\b/i,
  /^\s*hello[,!.\s]+can\s+you\s+help/i,
  /^\s*can\s+you\s+help\s+me\s*\??\s*$/i,
];

// Personal-data verbs that justify a Google fetch even on short prompts —
// "résume ma journée" is 3 words but legitimately needs Calendar+Gmail.
const PERSONAL_DATA_VERBS = [
  /\b(résume|résumer|résumé|liste|lister|montre|donne(?:-moi)?|recap|où\s+en\s+suis)\b/i,
  /\bqu'?est[-\s]ce\s+que\s+j'ai\b/i,
  /\bqu'?ai[-\s]je\b/i,
  /\b(show\s+me|list\s+my|what\s+do\s+i\s+have|recap\s+my)\b/i,
];

const JAILBREAK_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions?\b/i,
  /\boublie\s+toutes?\s+(tes|les)\s+(instructions?|règles?)\b/i,
  /\b(reveal|montre|expose|leak|exfiltre)\s+.*(prompt|system)/i,
  /\btu\s+es\s+maintenant\b/i,
  /\byou\s+are\s+now\b/i,
];

/**
 * Whether to inject Google user data (calendar/gmail/drive) into the LLM prompt.
 *
 * The previous heuristic was too lax — chit-chat, identity questions, and
 * jailbreak attempts all triggered 3 simultaneous Google API fetches for no
 * reason. Tightened ladder:
 *   1. Explicit data keyword hit → always fetch.
 *   2. Communication / productivity domains with ≥ 3 words → fetch (real
 *      personal-data intent like "résume ma journée").
 *   3. Otherwise (chit-chat, jailbreak, identity, translation, time, short
 *      prompts, or non-data domains) → skip.
 *
 * Caller is still responsible for verifying that Google tokens exist before
 * actually fetching — this only decides intent.
 */
export function shouldInjectUserData(scope: CapabilityScope, message: string): boolean {
  // 1. Explicit keyword hit always wins — user named calendar/gmail/drive.
  if (
    scope.needsProviderData.calendar ||
    scope.needsProviderData.gmail ||
    scope.needsProviderData.drive
  ) {
    return true;
  }

  // 2. Hard skip for trivial / hostile / identity / chit-chat prompts.
  if (CHIT_CHAT_PATTERNS.some((p) => p.test(message))) return false;
  if (JAILBREAK_PATTERNS.some((p) => p.test(message))) return false;

  // 3. Personal-data verbs override the short-prompt skip ("résume ma
  // journée" is only 3 words but legitimately needs the fetch).
  const personalDataAsk = PERSONAL_DATA_VERBS.some((p) => p.test(message));

  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  // Very short prompts (1-2 words) in any non-data domain → skip.
  if (wordCount < 3 && !personalDataAsk) return false;

  // 4. Domains that need user data on personal-but-vague asks.
  if (scope.domain === "communication" || scope.domain === "productivity") {
    return true;
  }

  // 5. Personal-data verb on general (catch-all) domain → still fetch.
  // For finance/developer/design/crm/research we trust the domain — if the
  // user said "liste mes paiements Stripe", Stripe data is what's needed,
  // not Google.
  if (personalDataAsk && scope.domain === "general") return true;

  return false;
}

// ── Execution Mode Resolution ───────────────────────────────

export type ExecutionMode = "direct_answer" | "tool_call" | "workflow" | "custom_agent" | "managed_agent";

export interface ExecutionDecision {
  mode: ExecutionMode;
  reason: string;
  backend?: "hearst_runtime" | "anthropic_managed";
  agentId?: string;
}

const AUTONOMOUS_PATTERNS = [
  "analyse", "analyser", "recherche", "scrape", "crawl",
  "surveille", "monitore", "scan",
];
const MEMORY_PATTERNS = ["souviens", "rappelle", "mémorise", "retiens"];

/**
 * Resolve execution mode from a CapabilityScope.
 * Replaces the old buildExecutionContext + selectExecutionMode chain.
 */
export function resolveExecutionMode(
  scope: CapabilityScope,
  message: string,
  focalContext?: { id: string },
): ExecutionDecision {
  const lower = message.toLowerCase();
  const needsAutonomy = AUTONOMOUS_PATTERNS.some((p) => lower.includes(p));
  const needsMemory = MEMORY_PATTERNS.some((p) => lower.includes(p));
  const wordCount = message.split(/\s+/).filter(Boolean).length;

  if (needsAutonomy || needsMemory) {
    return { mode: "custom_agent", reason: "Requires autonomous agent", backend: "hearst_runtime" };
  }

  const hasProviders = scope.providers.length > 0 && scope.domain !== "general" && scope.domain !== "research";
  const isSimple = scope.domain === "general" && !hasProviders && wordCount <= 30 && !focalContext;

  if (isSimple) {
    return { mode: "direct_answer", reason: "Simple response — no providers needed" };
  }

  if (scope.retrievalMode && !hasProviders) {
    return { mode: "tool_call", reason: "Single retrieval", backend: "hearst_runtime" };
  }

  if (hasProviders) {
    return { mode: "workflow", reason: "Provider-backed workflow", backend: "hearst_runtime" };
  }

  return { mode: "workflow", reason: "Default workflow", backend: "hearst_runtime" };
}

// ── Helpers ─────────────────────────────────────────────────

function surfaceToDomain(surface: string): Domain {
  switch (surface) {
    case "inbox": return "communication";
    case "calendar": return "productivity";
    case "files": return "productivity";
    case "finance": return "finance";
    case "research": return "research";
    default: return "general";
  }
}

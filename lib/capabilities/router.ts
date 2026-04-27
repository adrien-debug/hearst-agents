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

/**
 * Whether to inject Google user data (calendar/gmail/drive) into the LLM prompt.
 *
 * Default-on for user-data-likely domains so that vague-but-personal questions
 * like "qu'est-ce que j'ai aujourd'hui ?" or "résume ma journée" still get
 * the real data injected — the keyword detector misses these.
 *
 * Skipped for domains that use other providers (finance/Stripe, developer/GitHub)
 * or no provider at all (research/web). Also skipped for trivial chit-chat to
 * avoid wasted Gmail/Calendar API round-trips on "merci" / "ok".
 *
 * Caller is still responsible for verifying that Google tokens exist before
 * actually fetching — this only decides intent.
 */
export function shouldInjectUserData(scope: CapabilityScope, message: string): boolean {
  if (
    scope.needsProviderData.calendar ||
    scope.needsProviderData.gmail ||
    scope.needsProviderData.drive
  ) {
    return true;
  }

  if (scope.domain === "communication" || scope.domain === "productivity") {
    return true;
  }

  if (
    scope.domain === "research" ||
    scope.domain === "finance" ||
    scope.domain === "developer" ||
    scope.domain === "design" ||
    scope.domain === "crm"
  ) {
    return false;
  }

  if (scope.domain === "general") {
    // Vague-but-personal asks ("résume ma journée") are typically 3+ words.
    // Pure chit-chat ("merci", "Bonjour") is 1–2 words. The 3-word threshold
    // is permissive: a few false positives ("ok parfait merci") cost one
    // extra Gmail/Calendar RTT, which is acceptable.
    const wordCount = message.split(/\s+/).filter(Boolean).length;
    return wordCount > 2;
  }

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

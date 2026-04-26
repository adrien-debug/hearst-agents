/**
 * Capability Guard — Runtime validation gate for delegate().
 *
 * Validates that the agent and task are allowed for the current
 * capability scope before any execution happens.
 * This is a deterministic runtime gate, not a prompt-level guard.
 */

import {
  resolveDomain,
  isAgentValidForDomain,
  DOMAIN_TAXONOMY,
  type Domain,
} from "./taxonomy";

export interface CapabilityGuardInput {
  agent: string;
  task: string;
  domain?: Domain;
}

export type CapabilityGuardResult =
  | { allowed: true; domain: Domain; reason: string }
  | { allowed: false; domain: Domain; reason: string; suggestedAgents: string[] };

/**
 * Validate that an agent is allowed to execute in the resolved domain.
 *
 * If a domain is explicitly provided (from the pipeline's capScope),
 * it's used directly. Otherwise the domain is inferred from the task text.
 */
export function capabilityGuard(input: CapabilityGuardInput): CapabilityGuardResult {
  const domain = input.domain ?? resolveDomain(input.task);
  const entry = DOMAIN_TAXONOMY[domain];

  if (isAgentValidForDomain(input.agent, domain)) {
    return {
      allowed: true,
      domain,
      reason: `Agent "${input.agent}" is valid for domain "${domain}"`,
    };
  }

  return {
    allowed: false,
    domain,
    reason: `Agent "${input.agent}" is not allowed for domain "${domain}". Valid: ${entry.validAgents.join(", ")} + general agents.`,
    suggestedAgents: entry.validAgents,
  };
}

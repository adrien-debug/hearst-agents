/**
 * Provider Requirements — maps user intent to required external providers.
 *
 * Now derives keyword matching from the Provider Registry.
 * Used by the orchestrator to preflight provider readiness before execution.
 * Returns null when no external provider is needed.
 */

import {
  getAllProviders,
  getProviderLabel,
} from "@/lib/providers/registry";

export interface ProviderRequirementResult {
  capability: string;
  providers: string[];
  userMessage: string;
}

export function getRequiredProvidersForInput(input: string): ProviderRequirementResult | null {
  const lower = input.toLowerCase();

  const allProviders = getAllProviders();

  for (const provider of allProviders) {
    if (!provider.auth.connectable) continue;
    if (provider.keywords.fr.length === 0 && provider.keywords.en.length === 0) continue;

    const allKeywords = [...provider.keywords.fr, ...provider.keywords.en];
    const matched = allKeywords.some((k) => lower.includes(k));

    if (matched && provider.capabilities.length > 0) {
      const relevantProviders = allProviders
        .filter((p) => p.auth.connectable && p.capabilities.some((c) => provider.capabilities.includes(c)))
        .map((p) => p.id);

      return {
        capability: provider.capabilities[0],
        providers: relevantProviders.length > 0 ? relevantProviders : [provider.id],
        userMessage: provider.blockedMessage,
      };
    }
  }

  return null;
}

export function getBlockedReasonForProviders(providers: string[]): string {
  const names = providers.map((p) => getProviderLabel(p));
  if (names.length === 1) {
    return `${names[0]} is not connected`;
  }
  return `${names.join(" or ")} is not connected`;
}

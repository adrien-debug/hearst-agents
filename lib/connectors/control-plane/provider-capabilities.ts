/**
 * Provider → Capability mapping.
 *
 * Now delegates to the canonical Provider Registry.
 * This file re-exports for backward compatibility with existing consumers.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import {
  getAllProviders,
  getProviderCapabilitiesFromRegistry,
} from "@/lib/providers/registry";

/**
 * Derived from the Provider Registry at import time.
 * Consumers that iterate PROVIDER_CAPABILITIES keys will still work.
 */
export const PROVIDER_CAPABILITIES: Record<string, ConnectorCapability[]> =
  Object.fromEntries(
    getAllProviders()
      .filter((p) => p.capabilities.length > 0)
      .map((p) => [p.id, p.capabilities]),
  );

export function getProviderCapabilities(provider: string): ConnectorCapability[] {
  return getProviderCapabilitiesFromRegistry(provider);
}

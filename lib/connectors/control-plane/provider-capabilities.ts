/**
 * Provider → Capability mapping.
 *
 * Now delegates to the canonical Provider Registry.
 * This file re-exports for backward compatibility with existing consumers.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import { getProviderCapabilitiesFromRegistry } from "@/lib/providers/registry";

export function getProviderCapabilities(provider: string): ConnectorCapability[] {
  return getProviderCapabilitiesFromRegistry(provider);
}

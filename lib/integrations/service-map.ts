/**
 * Service Map — Bridge between UI serviceIds and runtime providerIds.
 *
 * This is the critical mapping layer that prevents ID divergence:
 * - UI shows: "gmail", "calendar", "drive" (separate services)
 * - Runtime uses: "google" (unified provider)
 * - Capability resolves to: "messaging", "calendar", "files"
 */

import type { ServiceId } from "./types";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";

interface ServiceMapping {
  providerId: string;
  capability: ConnectorCapability;
  icon: string;
  category: string;
}

/**
 * Canonical mapping: serviceId → { providerId, capability, icon, category }
 *
 * Why this exists:
 * - Users see granular services (gmail vs calendar vs drive)
 * - But OAuth and API calls go through unified provider (google)
 * - This map reconciles the two worlds
 */
export const SERVICE_MAP: Record<ServiceId, ServiceMapping> = {
  // Google Workspace (split into 3 visible services)
  gmail: {
    providerId: "google",
    capability: "messaging",
    icon: "/icons/services/gmail.svg",
    category: "communication",
  },
  calendar: {
    providerId: "google",
    capability: "calendar",
    icon: "/icons/services/google-calendar.svg",
    category: "productivity",
  },
  drive: {
    providerId: "google",
    capability: "files",
    icon: "/icons/services/google-drive.svg",
    category: "storage",
  },

  // Communication
  slack: {
    providerId: "slack",
    capability: "messaging",
    icon: "/icons/services/slack.svg",
    category: "communication",
  },

  // Productivity & Knowledge
  notion: {
    providerId: "notion",
    capability: "files",
    icon: "/icons/services/notion.svg",
    category: "productivity",
  },

  // Development
  github: {
    providerId: "github",
    capability: "developer_tools",
    icon: "/icons/services/github.svg",
    category: "dev",
  },
  jira: {
    providerId: "jira",
    capability: "developer_tools",
    icon: "/icons/services/jira.svg",
    category: "dev",
  },
  linear: {
    providerId: "linear",
    capability: "developer_tools",
    icon: "/icons/services/linear.svg",
    category: "dev",
  },

  // CRM & Sales
  hubspot: {
    providerId: "hubspot",
    capability: "crm",
    icon: "/icons/services/hubspot.svg",
    category: "crm",
  },

  // Finance
  stripe: {
    providerId: "stripe",
    capability: "finance",
    icon: "/icons/services/stripe.svg",
    category: "finance",
  },

  // Design
  figma: {
    providerId: "figma",
    capability: "design",
    icon: "/icons/services/figma.svg",
    category: "design",
  },

  // Automation
  zapier: {
    providerId: "zapier",
    capability: "automation",
    icon: "/icons/services/zapier.svg",
    category: "automation",
  },

  // Data & Spreadsheets
  airtable: {
    providerId: "airtable",
    capability: "files",
    icon: "/icons/services/airtable.svg",
    category: "productivity",
  },
};

// ── Public API ─────────────────────────────────────────────

/**
 * Get provider ID for a service ID.
 * Example: "gmail" → "google"
 */
export function getProviderIdForService(serviceId: ServiceId): string | undefined {
  return SERVICE_MAP[serviceId]?.providerId;
}

/**
 * Get capability for a service ID.
 * Example: "gmail" → "messaging"
 */
export function getCapabilityForService(serviceId: ServiceId): ConnectorCapability | undefined {
  return SERVICE_MAP[serviceId]?.capability;
}

/**
 * Get all services for a provider.
 * Example: "google" → ["gmail", "calendar", "drive"]
 */
export function getServicesForProvider(providerId: string): ServiceId[] {
  return Object.entries(SERVICE_MAP)
    .filter(([, mapping]) => mapping.providerId === providerId)
    .map(([serviceId]) => serviceId as ServiceId);
}

/**
 * Check if a service ID is valid.
 */
export function isValidServiceId(id: string): id is ServiceId {
  return id in SERVICE_MAP;
}

/**
 * Get all service IDs.
 */
export function getAllServiceIds(): ServiceId[] {
  return Object.keys(SERVICE_MAP) as ServiceId[];
}

/**
 * Get service mapping or throw.
 */
export function requireServiceMapping(serviceId: ServiceId): ServiceMapping {
  const mapping = SERVICE_MAP[serviceId];
  if (!mapping) {
    throw new Error(`Unknown serviceId: ${serviceId}`);
  }
  return mapping;
}

/**
 * Integrations — canonical types for the catalog and service mapping.
 *
 * This is the bridge layer between:
 * - Catalog (UI/discovery) → lib/integrations/catalog.ts
 * - Service Map (UI serviceId → runtime providerId) → lib/integrations/service-map.ts
 * - Runtime (execution) → lib/providers/registry.ts
 * - Connection (OAuth state) → lib/connectors/control-plane/
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";

// ── Service ID ─────────────────────────────────────────────

/**
 * Service IDs are what users see in the UI.
 * They are more granular than provider IDs.
 * Example: "gmail" (service) → "google" (provider)
 */
export type ServiceId =
  | "gmail"
  | "calendar"
  | "drive"
  | "slack"
  | "notion"
  | "github"
  | "hubspot"
  | "jira"
  | "linear"
  | "stripe"
  | "figma"
  | "airtable"
  | "zapier"
  | string; // For extensibility

// ── Catalog Types (UI/Discovery) ─────────────────────────────

export type ServiceTier = "tier_1" | "tier_2" | "tier_3";
export type ServiceStatus = "active" | "beta" | "planned" | "connected" | "disconnected";
export type IntegrationType = "native" | "hybrid" | "nango";

export interface ServiceCategory {
  id: string;
  label: string;
  icon: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: ServiceTier;
  type: IntegrationType;
  status: ServiceStatus;
  providerId: string; // Runtime provider ID (e.g., "google")
  capabilities: ConnectorCapability[];
  isConnectable: boolean;
  documentationUrl?: string;
  popularUseCases?: string[];
}

export interface ServiceWithConnectionStatus extends ServiceDefinition {
  connectionStatus: "connected" | "pending" | "error" | "disconnected";
  accountLabel?: string; // e.g., "adrien@gmail.com"
}

// ── Catalog Filters ────────────────────────────────────────

export interface CatalogFilters {
  category?: string;
  tier?: ServiceTier;
  status?: ServiceStatus;
  type?: IntegrationType;
  search?: string;
  connectedOnly?: boolean;
}

// ── Bundle Types ───────────────────────────────────────────

export interface ServiceBundle {
  id: string;
  name: string;
  description: string;
  icon: string;
  services: ServiceId[];
  recommendedFor: string[]; // e.g., ["sales", "founders"]
}

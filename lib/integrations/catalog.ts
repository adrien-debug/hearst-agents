/**
 * Catalog — Facade for service discovery and search.
 *
 * This is the UI-facing layer. It aggregates:
 * - Service definitions (from SERVICE_MAP + metadata)
 * - Connection status (from control-plane)
 * - Search/filter capabilities
 *
 * The runtime layer (lib/providers/registry.ts) never uses this directly.
 */

import {
  SERVICE_MAP,
  getAllServiceIds,
  getProviderIdForService,
} from "./service-map";
import { getUnifiedConnectors } from "@/lib/connectors/unified/reconcile";
import type {
  ServiceDefinition,
  ServiceWithConnectionStatus,
  CatalogFilters,
  ServiceBundle,
  ServiceTier,
} from "./types";

// ── Service Metadata (enrichment beyond service-map) ────────

interface ServiceMetadata {
  name: string;
  description: string;
  tier: ServiceTier;
  type: "native" | "hybrid" | "nango";
  popularUseCases?: string[];
}

const SERVICE_METADATA: Record<string, ServiceMetadata> = {
  // Tier 1 — Native UI, daily use
  gmail: {
    name: "Gmail",
    description: "Emails et messagerie",
    tier: "tier_1",
    type: "native",
    popularUseCases: ["Résumer mes emails", "Répondre à mes messages"],
  },
  calendar: {
    name: "Google Agenda",
    description: "Rendez-vous et planning",
    tier: "tier_1",
    type: "native",
    popularUseCases: ["Voir mes réunions", "Planifier un créneau"],
  },
  drive: {
    name: "Google Drive",
    description: "Fichiers et documents",
    tier: "tier_1",
    type: "native",
    popularUseCases: ["Trouver un document", "Analyser mes fichiers"],
  },
  slack: {
    name: "Slack",
    description: "Messages d'équipe",
    tier: "tier_1",
    type: "native",
    popularUseCases: ["Voir mes messages", "Envoyer un message"],
  },

  // Tier 1.5 — Strategic, no dedicated page
  notion: {
    name: "Notion",
    description: "Notes et bases de données",
    tier: "tier_2",
    type: "native",
    popularUseCases: ["Rechercher dans mes docs", "Créer une note"],
  },
  github: {
    name: "GitHub",
    description: "Dépôts et pull requests",
    tier: "tier_2",
    type: "native",
    popularUseCases: ["Voir mes PRs", "Revue de code"],
  },

  // Tier 2 — Hybrid (Nango auth + Hearst UI)
  hubspot: {
    name: "HubSpot",
    description: "CRM et contacts",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Lister mes deals", "Créer un contact"],
  },
  jira: {
    name: "Jira",
    description: "Suivi de tickets",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Mes tickets ouverts", "Créer un ticket"],
  },
  linear: {
    name: "Linear",
    description: "Gestion de projets",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Mes issues", "Roadmap produit"],
  },
  stripe: {
    name: "Stripe",
    description: "Paiements et revenus",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Chiffre d'affaires", "Analyse revenus"],
  },
  figma: {
    name: "Figma",
    description: "Design et prototypes",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Voir mes fichiers", "Commentaires"],
  },
  airtable: {
    name: "Airtable",
    description: "Bases de données",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Requêter mes bases", "Rapports"],
  },
  zapier: {
    name: "Zapier",
    description: "Automatisations",
    tier: "tier_2",
    type: "hybrid",
    popularUseCases: ["Lister mes zaps", "Créer un workflow"],
  },
};

// ── Bundles ────────────────────────────────────────────────

export const SERVICE_BUNDLES: ServiceBundle[] = [
  {
    id: "sales-stack",
    name: "Sales Stack",
    description: "CRM, email, et analytics pour équipes commerciales",
    icon: "",
    services: ["hubspot", "gmail", "calendar"],
    recommendedFor: ["sales", "revenue-teams"],
  },
  {
    id: "founder-stack",
    name: "Founder Stack",
    description: "Essentiels pour fondateurs : communication, planning, revenus",
    icon: "",
    services: ["gmail", "calendar", "drive", "slack", "stripe"],
    recommendedFor: ["founders", "startups"],
  },
  {
    id: "dev-stack",
    name: "Dev Stack",
    description: "Outils de développement et project management",
    icon: "",
    services: ["github", "jira", "linear", "slack"],
    recommendedFor: ["engineering", "product-teams"],
  },
];

// ── Public API ─────────────────────────────────────────────

/**
 * Get service definition by ID.
 */
export function getServiceDefinition(serviceId: string): ServiceDefinition | undefined {
  const mapping = SERVICE_MAP[serviceId as keyof typeof SERVICE_MAP];
  if (!mapping) return undefined;

  const meta = SERVICE_METADATA[serviceId] ?? {
    name: serviceId,
    description: "Intégration",
    tier: "tier_3" as const,
    type: "nango" as const,
  };

  return {
    id: serviceId,
    name: meta.name,
    description: meta.description,
    icon: mapping.icon,
    category: mapping.category,
    tier: meta.tier,
    type: meta.type,
    status: "planned", // Will be enriched with real connection status
    providerId: mapping.providerId,
    capabilities: [mapping.capability],
    isConnectable: true, // Default, will be checked against provider
    popularUseCases: meta.popularUseCases,
  };
}

/**
 * Get all service definitions.
 */
export function getAllServices(): ServiceDefinition[] {
  return getAllServiceIds().map((id) => getServiceDefinition(id)!).filter(Boolean);
}

/**
 * Get services by category.
 */
export function getServicesByCategory(category: string): ServiceDefinition[] {
  return getAllServices().filter((s) => s.category === category);
}

/**
 * Get services by tier.
 */
export function getServicesByTier(tier: ServiceTier): ServiceDefinition[] {
  return getAllServices().filter((s) => s.tier === tier);
}

/**
 * Search services.
 */
export function searchServices(query: string): ServiceDefinition[] {
  const q = query.toLowerCase();
  return getAllServices().filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  );
}

/**
 * Filter services.
 */
export function filterServices(filters: CatalogFilters): ServiceDefinition[] {
  let results = getAllServices();

  if (filters.category) {
    results = results.filter((s) => s.category === filters.category);
  }

  if (filters.tier) {
    results = results.filter((s) => s.tier === filters.tier);
  }

  if (filters.type) {
    results = results.filter((s) => s.type === filters.type);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }

  return results;
}

/**
 * Get recommended services for a user context.
 * (Placeholder — will use usage data in the future)
 */
export function getRecommendedServices(_context?: string): ServiceDefinition[] {
  // For now, return Tier 1 services
  return getServicesByTier("tier_1");
}

/**
 * Get bundle by ID.
 */
export function getBundle(id: string): ServiceBundle | undefined {
  return SERVICE_BUNDLES.find((b) => b.id === id);
}

/**
 * Get all bundles.
 */
export function getAllBundles(): ServiceBundle[] {
  return SERVICE_BUNDLES;
}

/**
 * Enrich services with connection status.
 * This is the bridge to control-plane.
 *
 * Client-side: calls /api/v2/user/connections
 * Server-side: uses unified reconciler directly
 */
export async function enrichWithConnectionStatus(
  services: ServiceDefinition[],
  _userId: string,
): Promise<ServiceWithConnectionStatus[]> {
  // Client-side: fetch from API
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/v2/user/connections", { credentials: "include" });
      if (!res.ok) {
        console.warn("[Catalog] Failed to fetch connections:", res.status);
        return services.map((s) => ({ ...s, connectionStatus: "disconnected" }));
      }
      const data = await res.json();
      return data.services as ServiceWithConnectionStatus[];
    } catch (err) {
      console.error("[Catalog] Error fetching connections:", err);
      return services.map((s) => ({ ...s, connectionStatus: "disconnected" }));
    }
  }

  // Server-side: use unified reconciler directly.
  // Resolve scope from env (consistent with lib/scope.ts)
  const tenantId = process.env.HEARST_TENANT_ID ?? "dev-tenant";
  const workspaceId = process.env.HEARST_WORKSPACE_ID ?? "dev-workspace";
  const connectors = await getUnifiedConnectors({
    tenantId,
    workspaceId,
    userId: _userId,
  });

  return services.map((s) => {
    const providerId = getProviderIdForService(s.id);
    const connector = connectors.find((c: { provider: string }) => c.provider === providerId);

    let connectionStatus: ServiceWithConnectionStatus["connectionStatus"] = "disconnected";
    let accountLabel: string | undefined;

    if (connector) {
      switch (connector.status) {
        case "connected":
          connectionStatus = "connected";
          accountLabel = connector.userId || connector.label;
          break;
        case "pending_auth":
          connectionStatus = "pending";
          break;
        case "degraded":
          connectionStatus = "error";
          break;
        case "disconnected":
        case "coming_soon":
        default:
          connectionStatus = "disconnected";
      }
    }

    return { ...s, connectionStatus, accountLabel };
  });
}

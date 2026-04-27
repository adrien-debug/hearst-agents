/**
 * GET /api/v2/catalog
 *
 * Unified app catalog for the App Hub.
 * Returns services with real connection status, filtered and paginated.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import {
  getAllServices,
  getServicesByCategory,
  getServicesByTier,
  getRecommendedServices,
  getAllBundles,
  filterServices,
  enrichWithConnectionStatus,
  SERVICE_BUNDLES,
} from "@/lib/integrations/catalog";
import type { CatalogFilters, ServiceDefinition } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

// Category order for consistent UI display
const CATEGORY_ORDER = [
  "communication",
  "productivity",
  "storage",
  "project",
  "crm",
  "dev",
  "design",
  "finance",
  "support",
  "analytics",
  "automation",
  "commerce",
  "other",
];

/**
 * GET /api/v2/catalog
 *
 * Query params:
 * - category: Filter by category
 * - tier: Filter by tier (tier_1, tier_2, tier_3)
 * - search: Search query
 * - includeNango: Include Tier 3 Nango services (default: true)
 * - limit: Max results (default: 50)
 * - connectedOnly: Only show connected services (default: false)
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Parse filters
    const category = searchParams.get("category") || undefined;
    const tier = (searchParams.get("tier") as CatalogFilters["tier"]) || undefined;
    const search = searchParams.get("search") || undefined;
    const includeNango = searchParams.get("includeNango") !== "false";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const connectedOnly = searchParams.get("connectedOnly") === "true";

    // Get base services
    let services: ServiceDefinition[] = [];

    // If category filter, use that
    if (category) {
      services = getServicesByCategory(category);
    }
    // If tier filter, use that
    else if (tier) {
      services = getServicesByTier(tier);
    }
    // If search, use search
    else if (search) {
      services = filterServices({ search, tier });
    }
    // Otherwise all services
    else {
      services = getAllServices();
    }

    // Tier 3 long-tail services are now served by Composio's per-user
    // discovery layer; the static Nango catalog has been retired.
    void includeNango;

    // Enrich with connection status (placeholder — will use control-plane)
    const servicesWithStatus = await enrichWithConnectionStatus(services, userId);

    // Filter connected only if requested
    const filtered = connectedOnly
      ? servicesWithStatus.filter((s) => s.connectionStatus === "connected")
      : servicesWithStatus;

    // Sort by tier priority, then name
    const tierPriority = { tier_1: 0, tier_2: 1, tier_3: 2 };
    const sorted = filtered.sort((a, b) => {
      const tierDiff = tierPriority[a.tier] - tierPriority[b.tier];
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    });

    // Limit results
    const limited = sorted.slice(0, limit);

    // Group by category if no specific filter
    let grouped: Record<string, typeof limited> | undefined;
    if (!category && !search) {
      grouped = {};
      for (const cat of CATEGORY_ORDER) {
        const catServices = limited.filter((s) => s.category === cat);
        if (catServices.length > 0) {
          grouped[cat] = catServices;
        }
      }
    }

    // Get counts by tier
    const counts = {
      tier_1: filtered.filter((s) => s.tier === "tier_1").length,
      tier_2: filtered.filter((s) => s.tier === "tier_2").length,
      tier_3: filtered.filter((s) => s.tier === "tier_3").length,
      connected: filtered.filter((s) => s.connectionStatus === "connected").length,
      total: filtered.length,
    };

    // Get recommended services
    const recommended = getRecommendedServices();

    return NextResponse.json({
      services: limited,
      grouped,
      counts,
      recommended,
      bundles: getAllBundles(),
      filters: { category, tier, search, includeNango, connectedOnly },
    });
  } catch (e) {
    console.error("GET /api/v2/catalog: error", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * GET /api/v2/catalog/categories
 * Helper endpoint for category list.
 */
export async function getCategories() {
  const categories = [
    { id: "communication", label: "Communication", icon: "communication" },
    { id: "productivity", label: "Productivité", icon: "productivity" },
    { id: "storage", label: "Stockage", icon: "storage" },
    { id: "project", label: "Gestion de projet", icon: "project" },
    { id: "crm", label: "CRM & Ventes", icon: "crm" },
    { id: "dev", label: "Développement", icon: "dev" },
    { id: "design", label: "Design", icon: "design" },
    { id: "finance", label: "Finance", icon: "finance" },
    { id: "support", label: "Support client", icon: "support" },
    { id: "analytics", label: "Analytics", icon: "analytics" },
    { id: "automation", label: "Automatisation", icon: "automation" },
    { id: "commerce", label: "E-commerce", icon: "commerce" },
    { id: "other", label: "Autres", icon: "other" },
  ];

  return NextResponse.json({ categories });
}

/**
 * GET /api/v2/catalog/bundles
 * Helper endpoint for bundles.
 */
export async function getBundles() {
  return NextResponse.json({ bundles: SERVICE_BUNDLES });
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceDefinition, ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "../components/AppCard";
import { AppDrawer } from "../components/AppDrawer";
import { AppCategorySection } from "../components/AppCategorySection";
import { getAllServices, getAllBundles } from "@/lib/integrations/catalog";
import { getNangoServices } from "@/lib/integrations/catalog.generated";
import { enrichWithConnectionStatus } from "@/lib/integrations/catalog";

const CATEGORY_ORDER = [
  "communication",
  "productivity",
  "storage",
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

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivité",
  storage: "Stockage",
  crm: "CRM & Ventes",
  dev: "Développement",
  design: "Design",
  finance: "Finance",
  support: "Support",
  analytics: "Analytics",
  automation: "Automatisation",
  commerce: "E-commerce",
  other: "Autres",
};

export default function AppsPage() {
  const [services, setServices] = useState<ServiceWithConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceWithConnectionStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "connected" | "tier_1" | "tier_2" | "tier_3">("all");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { surface } = useNavigationStore();

  // Load services on mount
  useEffect(() => {
    async function loadServices() {
      try {
        // Get all services (Tier 1/2 + Tier 3 Nango)
        const baseServices = [...getAllServices(), ...getNangoServices()];

        // TODO: Replace with real user ID from session
        const enriched = await enrichWithConnectionStatus(baseServices, "temp-user-id");
        setServices(enriched);
      } catch (error) {
        console.error("Failed to load services:", error);
      } finally {
        setLoading(false);
      }
    }

    loadServices();
  }, []);

  // Filtered services
  const filteredServices = useMemo(() => {
    let result = services;

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }

    // Apply category/tier filter
    switch (activeFilter) {
      case "connected":
        result = result.filter((s) => s.connectionStatus === "connected");
        break;
      case "tier_1":
        result = result.filter((s) => s.tier === "tier_1");
        break;
      case "tier_2":
        result = result.filter((s) => s.tier === "tier_2");
        break;
      case "tier_3":
        result = result.filter((s) => s.tier === "tier_3");
        break;
    }

    return result;
  }, [services, searchQuery, activeFilter]);

  // Group by category
  const groupedServices = useMemo(() => {
    const grouped: Record<string, ServiceWithConnectionStatus[]> = {};

    for (const cat of CATEGORY_ORDER) {
      const catServices = filteredServices.filter((s) => s.category === cat);
      if (catServices.length > 0) {
        grouped[cat] = catServices;
      }
    }

    return grouped;
  }, [filteredServices]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: services.length,
      connected: services.filter((s) => s.connectionStatus === "connected").length,
      tier1: services.filter((s) => s.tier === "tier_1").length,
      tier2: services.filter((s) => s.tier === "tier_2").length,
      tier3: services.filter((s) => s.tier === "tier_3").length,
    };
  }, [services]);

  // Bundles
  const bundles = useMemo(() => getAllBundles(), []);

  // Handle service click
  const handleServiceClick = (service: ServiceWithConnectionStatus) => {
    setSelectedService(service);
    setIsDrawerOpen(true);
  };

  // Handle connect (placeholder)
  const handleConnect = async (serviceId: string) => {
    console.log("Connecting to:", serviceId);
    // TODO: Implement OAuth flow via /api/nango/connect
    // Redirect to OAuth, then update service status on callback
  };

  // Connected services for "Connected" section
  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 text-sm">Chargement des applications...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">App Hub</h1>
            <p className="text-sm text-white/40">
              {stats.connected} connecté{stats.connected !== 1 ? "s" : ""} sur {stats.total} applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30 bg-white/[0.05] px-3 py-1.5 rounded-full">
              ⌘K pour rechercher
            </span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une application..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { id: "all", label: "Toutes", count: stats.total },
              { id: "connected", label: "Connectés", count: stats.connected },
              { id: "tier_1", label: "Essentiels", count: stats.tier1 },
              { id: "tier_2", label: "Recommandés", count: stats.tier2 },
              { id: "tier_3", label: "Catalogue", count: stats.tier3 },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id as typeof activeFilter)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFilter === filter.id
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]"
                }`}
              >
                {filter.label}
                <span className="ml-1.5 text-white/30">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Connected Section (if any and not filtered) */}
        {activeFilter !== "connected" && connectedServices.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <h2 className="text-sm font-medium text-white/80 uppercase tracking-wider">
                Connectés
              </h2>
              <span className="text-xs text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full">
                {connectedServices.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {connectedServices.slice(0, 4).map((service) => (
                <AppCard
                  key={service.id}
                  service={service}
                  onClick={() => handleServiceClick(service)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Bundles (if no search/filter) */}
        {activeFilter === "all" && !searchQuery && bundles.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg">📦</span>
              <h2 className="text-sm font-medium text-white/80 uppercase tracking-wider">
                Bundles recommandés
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {bundles.map((bundle) => (
                <AppCard
                  key={bundle.id}
                  service={{
                    id: bundle.id,
                    name: bundle.name,
                    description: bundle.description,
                    icon: bundle.icon,
                    category: "other",
                    tier: "tier_2",
                    type: "hybrid",
                    status: "active",
                    providerId: "bundle",
                    capabilities: [],
                    isConnectable: true,
                    popularUseCases: bundle.services,
                  }}
                  variant="bundle"
                  onClick={() => console.log("Activate bundle:", bundle.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        {Object.entries(groupedServices).map(([category, catServices]) => (
          <AppCategorySection
            key={category}
            title={CATEGORY_LABELS[category] || category}
            services={catServices}
            onServiceClick={handleServiceClick}
          />
        ))}

        {/* Empty state */}
        {filteredServices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <p className="text-white/60 mb-2">Aucune application trouvée</p>
            <p className="text-sm text-white/30">
              Essayez une autre recherche ou filtre
            </p>
          </div>
        )}
      </div>

      {/* Drawer */}
      <AppDrawer
        service={selectedService}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onConnect={handleConnect}
      />
    </div>
  );
}

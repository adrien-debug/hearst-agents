"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "../components/AppCard";
import { AppDrawer } from "../components/AppDrawer";
import { AppCategorySection } from "../components/AppCategorySection";
import { getAllServices, getAllBundles } from "@/lib/integrations/catalog";
import { getNangoServices } from "@/lib/integrations/catalog.generated";
import { enrichWithConnectionStatus } from "@/lib/integrations/catalog";
import Nango from "@nangohq/frontend";
import { toast } from "@/app/hooks/use-toast";

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
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const { surface: _surface } = useNavigationStore();
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session?.user as any)?.id as string | undefined;

  // Load services on mount
  useEffect(() => {
    async function loadServices() {
      try {
        // Get all services (Tier 1/2 + Tier 3 Nango)
        const baseServices = [...getAllServices(), ...getNangoServices()];

        // Use real user ID from session
        const enriched = await enrichWithConnectionStatus(baseServices, userId || "anonymous");
        setServices(enriched);
        console.log(`[AppsPage] Loaded ${enriched.filter(s => s.connectionStatus === "connected").length} connected services`);
      } catch (error) {
        console.error("[AppsPage] Failed to load services:", error);
      } finally {
        setLoading(false);
      }
    }

    loadServices();
  }, [userId]);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleServiceClickAny = (service: any) => handleServiceClick(service as ServiceWithConnectionStatus);

  // Service ID → Provider ID mapping for OAuth
  const getProviderForService = (serviceId: string): string | null => {
    const map: Record<string, string> = {
      gmail: "google",
      calendar: "google",
      drive: "google",
      slack: "slack",
      notion: "notion",
      github: "github",
      hubspot: "hubspot",
      jira: "jira",
      linear: "linear",
      stripe: "stripe",
      figma: "figma",
      airtable: "airtable",
      zapier: "zapier",
    };
    return map[serviceId] || null;
  };

  // Handle connect — initiate OAuth via Nango
  const handleConnect = async (serviceId: string) => {
    const provider = getProviderForService(serviceId);
    if (!provider) {
      console.error(`[AppsPage] No provider mapping for service: ${serviceId}`);
      toast.error("Service non supporté", `Impossible de connecter ${serviceId}`);
      return;
    }

    setIsConnecting(serviceId);
    console.log(`[AppsPage] Initiating OAuth for ${serviceId} via ${provider}`);

    try {
      // Step 1: Get OAuth config from backend
      const res = await fetch("/api/nango/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("[AppsPage] OAuth init failed:", err);
        toast.error("Échec de connexion", err.message || "Service temporairement indisponible");
        setIsConnecting(null);
        return;
      }

      const data = await res.json();
      if (!data.success || !data.config) {
        console.error("[AppsPage] Invalid OAuth config:", data);
        toast.error("Configuration invalide", "Impossible d'initialiser l'authentification");
        setIsConnecting(null);
        return;
      }

      console.log(`[AppsPage] OAuth config received for ${provider}`);

      // Step 2: Initialize Nango SDK and open OAuth popup
      const nango = new Nango({ 
        publicKey: data.config.publicKey,
        host: data.config.host 
      });

      try {
        // Open OAuth popup and wait for completion
        const result = await nango.auth(provider, data.config.connectionId);
        
        if (result) {
          console.log(`[AppsPage] OAuth successful for ${provider}`);
          
          // Step 3: Refresh services list to show updated connection status
          const baseServices = [...getAllServices(), ...getNangoServices()];
          const enriched = await enrichWithConnectionStatus(baseServices, userId || "anonymous");
          setServices(enriched);
          
          // Close drawer and show success message
          setIsDrawerOpen(false);
          toast.success("Connexion réussie", `${serviceId} est maintenant connecté`);
        } else {
          console.log(`[AppsPage] OAuth cancelled by user for ${provider}`);
          // User cancelled, no error toast needed
        }
      } catch (oauthError) {
        console.error("[AppsPage] OAuth popup failed:", oauthError);
        
        // Check if popup was blocked
        const errorMessage = (oauthError as Error).message || "";
        if (errorMessage.includes("popup") || errorMessage.includes("blocked")) {
          toast.warning("Popup bloquée", "Veuillez autoriser les popups pour ce site dans les paramètres du navigateur");
        } else {
          toast.error("Erreur OAuth", errorMessage || "La connexion a échoué");
        }
      }

    } catch (err) {
      console.error("[AppsPage] OAuth initiation failed:", err);
      toast.error("Erreur de connexion", "Impossible d'initier l'authentification");
    } finally {
      setIsConnecting(null);
    }
  };

  // Connected services for "Connected" section
  const connectedServices = useMemo(
    () => services.filter((s) => s.connectionStatus === "connected"),
    [services]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-[var(--text-muted)] text-sm">Chargement des applications...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-[var(--text)] mb-1">App Hub</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {stats.connected} connecté{stats.connected !== 1 ? "s" : ""} sur {stats.total} applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-faint)] bg-white/[0.05] px-3 py-1.5 rounded-full">
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
              className="w-full bg-white/[0.03] border border-[var(--line)] rounded-lg px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--cykan)]/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-soft)]"
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
                    ? "bg-[var(--cykan)]/15 text-[var(--cykan)] border border-[var(--cykan)]/30"
                    : "bg-white/[0.03] text-[var(--text-muted)] border border-[var(--line)] hover:bg-white/[0.05]"
                }`}
              >
                {filter.label}
                <span className="ml-1.5 text-[var(--text-faint)]">{filter.count}</span>
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
              <span className="w-2 h-2 rounded-full bg-[var(--money)]" />
              <h2 className="text-sm font-medium text-[var(--text-soft)] uppercase tracking-wider">
                Connectés
              </h2>
              <span className="text-xs text-[var(--text-faint)] bg-white/[0.05] px-2 py-0.5 rounded-full">
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
              <h2 className="text-sm font-medium text-[var(--text-soft)] uppercase tracking-wider">
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
            onServiceClick={handleServiceClickAny}
          />
        ))}

        {/* Empty state */}
        {filteredServices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <p className="text-[var(--text-muted)] mb-2">Aucune application trouvée</p>
            <p className="text-sm text-[var(--text-faint)]">
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
        isConnecting={isConnecting === selectedService?.id}
      />
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useNavigationStore } from "@/stores/navigation";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { AppCard } from "../components/AppCard";
import { AppDrawer } from "../components/AppDrawer";
import { AppCategorySection } from "../components/AppCategorySection";
import { ComposioConnectionsCard } from "../components/ComposioConnectionsCard";
import { getAllServices, getAllBundles } from "@/lib/integrations/catalog";
import { getNangoServices } from "@/lib/integrations/catalog.generated";
import { enrichWithConnectionStatus } from "@/lib/integrations/catalog";
import Nango from "@nangohq/frontend";
import { toast } from "@/app/hooks/use-toast";
import { GhostIconLayers, GhostIconSearch, GhostIconX } from "../components/ghost-icons";

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
        toast.error("Échec du chargement", "Impossible de charger les services");
        // Set services to base list without connection status
        const baseServices = [...getAllServices(), ...getNangoServices()];
        setServices(baseServices.map(s => ({ ...s, connectionStatus: "disconnected" as const })));
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
        return;
      }

      const data = await res.json();
      if (!data.success || !data.config) {
        console.error("[AppsPage] Invalid OAuth config:", data);
        toast.error("Configuration invalide", "Impossible d'initialiser l'authentification");
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
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8" style={{ background: "var(--bg)" }}>
        <p className="ghost-meta-label">LOAD_APP_HUB</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
          <div className="ghost-skeleton-bar" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-8">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div>
            <p className="ghost-meta-label mb-2">CTRL_PLANE</p>
            <h1 className="ghost-title-impact text-xl">App Hub</h1>
            <p className="t-11 font-mono uppercase tracking-[0.15em] text-[var(--text-muted)] mt-2">
              LINK_OK_{stats.connected}_TOTAL_{stats.total}
            </p>
          </div>
          <span className="font-mono t-9 uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-1">
            SHORTCUT_MOD_K
          </span>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="QUERY_APP_"
              className="ghost-input-line w-full pr-10"
            />
            <GhostIconSearch className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] p-1"
                aria-label="Effacer"
              >
                <GhostIconX className="w-4 h-4" />
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
                className={`font-mono t-9 uppercase tracking-[0.15em] whitespace-nowrap pb-1 border-b-2 transition-colors ${
                  activeFilter === filter.id
                    ? "text-[var(--cykan)] border-[var(--cykan)]"
                    : "text-[var(--text-faint)] border-transparent hover:text-[var(--text-muted)]"
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
        {/* Composio: 1500+ agent actions, multi-tenant per user */}
        <ComposioConnectionsCard />

        {/* Connected Section (if any and not filtered) */}
        {activeFilter !== "connected" && connectedServices.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-4 mb-6 border-b border-[var(--line)] pb-4">
              <span className="w-1.5 h-1.5 bg-[var(--money)] shrink-0" />
              <h2 className="t-11 font-mono uppercase tracking-[0.35em] text-[var(--text-muted)]">Linked</h2>
              <span className="ml-auto font-mono t-9 uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--money)] pb-0.5">
                N_{connectedServices.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[var(--line)]">
              {connectedServices.slice(0, 4).map((service) => (
                <div key={service.id} className="bg-[var(--bg)] min-h-0">
                  <AppCard service={service} onClick={() => handleServiceClick(service)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {activeFilter === "all" && !searchQuery && bundles.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-4 mb-6 border-b border-[var(--line)] pb-4">
              <GhostIconLayers className="w-5 h-5 text-[var(--text-muted)]" />
              <h2 className="t-11 font-mono uppercase tracking-[0.35em] text-[var(--text-muted)]">Bundles</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--line)]">
              {bundles.map((bundle) => (
                <div key={bundle.id} className="bg-[var(--bg)] min-h-0">
                <AppCard
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
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        {Object.entries(groupedServices).map(([category, catServices]) => (
          <AppCategorySection
            key={category}
            categoryId={category}
            title={CATEGORY_LABELS[category] || category}
            services={catServices}
            onServiceClick={handleServiceClickAny}
          />
        ))}

        {/* Empty state */}
        {filteredServices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <GhostIconSearch className="w-12 h-12 text-[var(--text-faint)]" />
            <p className="ghost-meta-label">NO_MATCH</p>
            <p className="text-xs font-light text-[var(--text-muted)]">Adjust QUERY or FILTER.</p>
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

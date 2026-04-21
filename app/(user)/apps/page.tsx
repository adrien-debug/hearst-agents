"use client";

import { useState, useMemo, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CORE_CONNECTORS, EXTERNAL_CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorMeta } from "@/lib/connectors/types";
import { useConnectorsPanel, type PanelConnection } from "@/app/hooks/use-connectors-panel";
import { PROVIDER_CAPABILITIES } from "@/lib/connectors/control-plane/provider-capabilities";
import { canDirectConnect, triggerConnect } from "@/app/lib/connect-actions";

import { BLUEPRINT_REGISTRY } from "@/lib/blueprints/registry";
import { BlueprintEngine } from "@/lib/blueprints/engine";

const CATEGORIES: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivité",
  storage: "Stockage",
  project: "Gestion de projet",
  crm: "CRM",
  dev: "Développement",
  analytics: "Analytics",
  other: "Autres",
};

const BLUEPRINTS = [
  {
    title: "Pipeline de Vente Automatisé",
    description: "Connectez Salesforce + Slack + Gmail pour qualifier vos leads automatiquement.",
    apps: ["salesforce", "slack", "gmail"],
    color: "from-blue-500/20 to-cyan-500/20",
  },
  {
    title: "Intelligence Financière",
    description: "Stripe + QuickBooks + Slack pour des alertes de revenus en temps réel.",
    apps: ["stripe", "quickbooks", "slack"],
    color: "from-emerald-500/20 to-teal-500/20",
  },
  {
    title: "DevOps Sentinel",
    description: "GitHub + Sentry + Vercel pour monitorer vos déploiements sans effort.",
    apps: ["github", "sentry", "vercel"],
    color: "from-purple-500/20 to-pink-500/20",
  },
];

function AppsContent() {
  const { connections: unifiedConns, loading: servicesLoading } = useConnectorsPanel();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const unifiedMap = useMemo(() => {
    const m = new Map<string, PanelConnection>();
    for (const c of unifiedConns) m.set(c.provider, c);
    return m;
  }, [unifiedConns]);

  function isConnected(c: ConnectorMeta): boolean {
    if (!c.provider) return false;
    const u = unifiedMap.get(c.provider);
    return u?.status === "connected";
  }

  const filteredExternal = useMemo(() => {
    let list = EXTERNAL_CONNECTORS;
    if (categoryFilter !== "all") {
      list = list.filter((c) => c.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [categoryFilter, search]);

  const categories = useMemo(() => {
    const cats = new Set(EXTERNAL_CONNECTORS.map((c) => c.category));
    return Array.from(cats).sort();
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-white">
      {/* ── Hero section ── */}
      <div className="relative overflow-hidden border-b border-white/5 px-8 py-12">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="relative z-10">
          <h1 className="font-mono text-3xl font-bold tracking-tighter uppercase sm:text-4xl">
            Intelligence <span className="text-cyan-accent">Store</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/40 leading-relaxed">
            Hearst OS orchestre vos données à travers <span className="text-white/80 font-medium">200+ services</span>. 
            Connectez vos outils pour transformer votre flux de travail en missions autonomes.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8 scrollbar-hide">
        {/* ── Blueprints (The "Billion Dollar" Layer) ── */}
        <section className="mb-12">
          <h2 className="font-mono text-[10px] font-normal tracking-[0.3em] uppercase text-cyan-accent/50 mb-6">
            Blueprints Recommandés
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BLUEPRINT_REGISTRY.map((bp) => {
              const { isValid, missing } = BlueprintEngine.validateSync(bp.id, Array.from(unifiedMap.keys()));
              return (
                <div 
                  key={bp.id}
                  className={`group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br ${bp.color} p-6 transition-all hover:border-white/10`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-white/90">{bp.title}</h3>
                    <span className="text-xl">{bp.icon}</span>
                  </div>
                  <p className="text-sm text-white/40 leading-relaxed line-clamp-2">{bp.description}</p>
                  
                  <div className="mt-6 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {bp.requiredConnectors.slice(0, 3).map(appId => {
                        const app = [...CORE_CONNECTORS, ...EXTERNAL_CONNECTORS].find(a => a.id === appId);
                        const connected = unifiedMap.get(app?.provider || "")?.status === "connected";
                        return (
                          <div 
                            key={appId} 
                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#09090b] bg-zinc-900 text-sm transition-transform group-hover:translate-x-1 ${connected ? "ring-2 ring-cyan-accent/50" : "opacity-40"}`} 
                            title={app?.name}
                          >
                            {app?.icon}
                          </div>
                        );
                      })}
                    </div>
                    
                    <button 
                      onClick={async () => {
                        if (!isValid || activatingId) return;
                        setActivatingId(bp.id);
                        // Simulation de l'activation neurale
                        await new Promise(r => setTimeout(r, 2000));
                        setActivatingId(null);
                        alert(`Blueprint "${bp.title}" activé avec succès !`);
                      }}
                      className={`ml-auto rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 relative overflow-hidden ${
                        isValid 
                          ? "bg-cyan-accent text-[#09090b] hover:shadow-[0_0_15px_#00e5ff]" 
                          : "bg-white/10 text-white/40 hover:bg-white/20"
                      }`}
                    >
                      {activatingId === bp.id ? (
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 animate-spin rounded-full border-2 border-[#09090b] border-t-transparent" />
                          Linking...
                        </span>
                      ) : (
                        isValid ? "Activer" : `${missing.length} requis`
                      )}
                      {activatingId === bp.id && (
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      )}
                    </button>
                  </div>
                  {activatingId === bp.id && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="scan-overlay" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Search & Filters ── */}
        <div className="sticky top-0 z-20 mb-8 flex flex-col gap-4 bg-[#09090b]/80 py-4 backdrop-blur-md md:flex-row md:items-center">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une capacité (ex: Stripe, Analytics, CRM...)"
              className="w-full rounded-xl border border-white/5 bg-white/5 py-3 pl-12 pr-4 text-sm text-white placeholder-white/20 outline-none transition-all focus:border-cyan-accent/30 focus:bg-white/[0.07]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                categoryFilter === "all" ? "bg-cyan-accent text-[#09090b]" : "bg-white/5 text-white/40 hover:text-white"
              }`}
            >
              Tous
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                  categoryFilter === cat ? "bg-cyan-accent text-[#09090b]" : "bg-white/5 text-white/40 hover:text-white"
                }`}
              >
                {CATEGORIES[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grid ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredExternal.map((app) => {
            const connected = isConnected(app);
            return (
              <div
                key={app.id}
                className="group relative flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between">
                  <span className="text-3xl grayscale group-hover:grayscale-0 transition-all duration-500">{app.icon}</span>
                  {connected ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tighter text-emerald-500">
                      <span className="h-1 w-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      Actif
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Bientôt</span>
                  )}
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/90">{app.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/30">
                    {app.description}
                  </p>
                </div>
                <button 
                  disabled={connected}
                  className={`mt-6 w-full rounded-lg py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    connected 
                      ? "bg-white/5 text-white/20 cursor-default" 
                      : "bg-white/5 text-white/60 hover:bg-cyan-accent hover:text-[#09090b]"
                  }`}
                >
                  {connected ? "Connecté" : "Détails"}
                </button>
              </div>
            );
          })}
        </div>

        {filteredExternal.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-xl mb-4">🔍</div>
            <p className="text-white/40 italic">Aucun service ne correspond à votre recherche.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#09090b] font-mono text-xs text-cyan-accent/50 animate-pulse">Initialisation du Store...</div>}>
      <AppsContent />
    </Suspense>
  );
}

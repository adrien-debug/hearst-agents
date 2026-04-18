"use client";

import { useState, useMemo, Suspense } from "react";
import { signIn } from "next-auth/react";
import { CORE_CONNECTORS, EXTERNAL_CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorMeta } from "@/lib/connectors/types";
import { useConnectedServices } from "../../hooks/use-connected-services";

const CATEGORIES: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivité",
  storage: "Stockage",
  project: "Gestion de projet",
  crm: "CRM",
  dev: "Développement",
  analytics: "Analytics",
  other: "Autre",
};

type CategoryFilter = "all" | ConnectorMeta["category"];

function AppsContent() {
  const { isConnected: isProviderConnected, loading: servicesLoading } = useConnectedServices();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");

  function isConnected(c: ConnectorMeta): boolean {
    if (!c.provider) return false;
    return isProviderConnected(c.provider);
  }

  function getConnectAction(c: ConnectorMeta): (() => void) | undefined {
    if (isConnected(c)) return undefined;
    if (c.connectAction === "google") return () => signIn("google");
    if (c.connectAction === "slack") return () => { window.location.href = "/api/auth/slack"; };
    return undefined;
  }

  const connectedCore = CORE_CONNECTORS.filter(isConnected);
  const availableCore = CORE_CONNECTORS.filter((c) => !isConnected(c));

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

  const externalCategories = useMemo(() => {
    const cats = new Set(EXTERNAL_CONNECTORS.map((c) => c.category));
    return Array.from(cats).sort();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-800/60 px-6 py-5">
        <h1 className="text-xl font-semibold text-white">Applications</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {servicesLoading
            ? "Vérification des connexions..."
            : connectedCore.length > 0
              ? `${connectedCore.length} service${connectedCore.length > 1 ? "s" : ""} connecté${connectedCore.length > 1 ? "s" : ""} · ${EXTERNAL_CONNECTORS.length}+ disponibles`
              : `${EXTERNAL_CONNECTORS.length}+ services disponibles`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Loading skeleton */}
        {servicesLoading && (
          <div className="border-b border-zinc-800/40 px-6 py-4">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-3">
                  <div className="h-6 w-6 rounded bg-zinc-800" />
                  <div className="flex-1">
                    <div className="h-3 w-24 rounded bg-zinc-800" />
                    <div className="mt-1 h-2 w-32 rounded bg-zinc-800/60" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected */}
        {!servicesLoading && connectedCore.length > 0 && (
          <div className="border-b border-zinc-800/40 px-6 py-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Connectés
            </h2>
            <div className="space-y-2">
              {connectedCore.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-3"
                >
                  <span className="text-lg">{app.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{app.name}</p>
                    <p className="text-xs text-zinc-500">{app.description}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Actif
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Core — Essentiels */}
        {!servicesLoading && availableCore.length > 0 && (
          <div className="border-b border-zinc-800/40 px-6 py-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Essentiels
            </h2>
            <div className="space-y-2">
              {availableCore.map((app) => {
                const action = getConnectAction(app);
                return (
                  <div
                    key={app.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-3 transition-all duration-200 hover:bg-zinc-800/50"
                  >
                    <span className="text-lg">{app.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-300">{app.name}</p>
                      <p className="text-xs text-zinc-600">{app.description}</p>
                    </div>
                    <button
                      onClick={action}
                      disabled={!action}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-all duration-200 hover:border-zinc-500 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {action ? "Connecter" : "Bientôt"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* External — Autres services */}
        <div className="px-6 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Autres services
              <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] font-normal text-zinc-500">
                {EXTERNAL_CONNECTORS.length}+
              </span>
            </h2>
          </div>

          {/* Search + filter */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un service..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-xs text-zinc-300 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
                categoryFilter === "all"
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Tous
            </button>
            {externalCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat as CategoryFilter)}
                className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
                  categoryFilter === cat
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {CATEGORIES[cat] ?? cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          {filteredExternal.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-600">
              Aucun service trouvé
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filteredExternal.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800/40 bg-zinc-900/20 px-3.5 py-2.5 transition-colors hover:bg-zinc-800/30"
                >
                  <span className="text-base">{app.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-400">{app.name}</p>
                    <p className="truncate text-[10px] text-zinc-600">{app.description}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-zinc-700">Bientôt</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-zinc-500">Chargement...</div>}>
      <AppsContent />
    </Suspense>
  );
}

"use client";

/**
 * LibraryTabs — orchestre 3 onglets (Général / Assets / Missions).
 * Tab actif persisté dans localStorage (`hearst.rightpanel.activeTab`).
 * "Général" est le premier onglet par défaut — récapitulatif d'ensemble.
 */

import { useEffect, useState } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { AssetsGrid } from "./AssetsGrid";
import { MissionsList } from "./MissionsList";
import { GeneralRecap } from "./GeneralRecap";

type TabKey = "general" | "assets" | "missions";

const STORAGE_KEY = "hearst.rightpanel.activeTab";

interface LibraryTabsProps {
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  reportSuggestions?: RightPanelData["reportSuggestions"];
  activeThreadId: string | null;
  loading: boolean;
}

export function LibraryTabs({ assets, missions, reportSuggestions, activeThreadId, loading }: LibraryTabsProps) {
  // Init SSR-stable à "general" pour que le HTML rendu côté serveur matche
  // le 1er render client. Hydrate depuis localStorage dans useEffect (post-
  // mount, donc plus dans la phase d'hydration). Évite le mismatch sur
  // aria-selected, className et l'underline sibling.
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      // Migration: "activity" n'existe plus, on fallback vers "general"
      if (v === "missions" || v === "assets") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(v);
      } else if (v === "activity") {
        // Migration silencieuse vers le nouvel onglet par défaut
        localStorage.setItem(STORAGE_KEY, "general");
      }
    } catch {
      /* localStorage indisponible — on garde "general" */
    }
  }, []);

  const switchTab = (next: TabKey) => {
    setActiveTab(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const suggestionsCount = reportSuggestions?.length ?? 0;
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "general", label: "Général", count: assets.length + missions.length },
    { key: "assets", label: "Assets", count: assets.length + suggestionsCount },
    { key: "missions", label: "Missions", count: missions.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        role="tablist"
        aria-label="Bibliothèque"
        className="flex items-center gap-3 px-4 border-b border-[var(--border-shell)]"
        style={{ height: "var(--space-10)" }}
      >
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(t.key)}
              style={{ letterSpacing: "var(--tracking-section)" }}
              className={`relative inline-flex items-center gap-2 t-9 font-mono uppercase py-2 transition-colors ${
                isActive
                  ? "text-[var(--cykan)]"
                  : "text-[var(--text-faint)] hover:text-[var(--text-soft)]"
              }`}
            >
              <span>{t.label}</span>
              <span className="opacity-70">{t.count}</span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-px h-px"
                  style={{ background: "var(--cykan)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {activeTab === "general" && (
          <GeneralRecap
            assets={assets}
            missions={missions}
            reportSuggestions={reportSuggestions}
            loading={loading}
          />
        )}
        {activeTab === "assets" && (
          <AssetsGrid
            assets={assets}
            reportSuggestions={reportSuggestions}
            activeThreadId={activeThreadId}
            loading={loading}
          />
        )}
        {activeTab === "missions" && (
          <MissionsList missions={missions} activeThreadId={activeThreadId} loading={loading} />
        )}
      </div>
    </div>
  );
}

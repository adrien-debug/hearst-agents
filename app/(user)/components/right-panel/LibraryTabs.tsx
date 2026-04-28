"use client";

/**
 * LibraryTabs — orchestre 3 onglets (Assets / Missions / Activité).
 * Tab actif persisté dans localStorage (`hearst.rightpanel.activeTab`).
 */

import { useEffect, useState } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { useRuntimeStore } from "@/stores/runtime";
import { AssetsGrid } from "./AssetsGrid";
import { MissionsList } from "./MissionsList";
import { ActivityTimeline } from "./ActivityTimeline";

type TabKey = "assets" | "missions" | "activity";

const STORAGE_KEY = "hearst.rightpanel.activeTab";

interface LibraryTabsProps {
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  activeThreadId: string | null;
  loading: boolean;
}

export function LibraryTabs({ assets, missions, activeThreadId, loading }: LibraryTabsProps) {
  const eventsCount = useRuntimeStore((s) => s.events.length);

  // Init SSR-stable à "assets" pour que le HTML rendu côté serveur matche
  // le 1er render client. Hydrate depuis localStorage dans useEffect (post-
  // mount, donc plus dans la phase d'hydration). Évite le mismatch sur
  // aria-selected, className et l'underline sibling. Le "flash" assets →
  // valeur stockée est imperceptible (un seul re-render).
  const [activeTab, setActiveTab] = useState<TabKey>("assets");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "missions" || v === "activity" || v === "assets") {
        // Hydratation post-mount : nécessaire pour matcher le HTML SSR.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(v);
      }
    } catch {
      /* localStorage indisponible — on garde "assets" */
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

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "assets", label: "Assets", count: assets.length },
    { key: "missions", label: "Missions", count: missions.length },
    { key: "activity", label: "Activité", count: eventsCount },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        role="tablist"
        aria-label="Bibliothèque"
        className="flex items-center gap-3 px-4 border-b border-[var(--border-shell)]"
        style={{ height: "40px" }}
      >
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => switchTab(t.key)}
              className={`relative inline-flex items-center gap-1.5 t-9 font-mono tracking-[0.22em] uppercase py-2 transition-colors ${
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
        {activeTab === "assets" && (
          <AssetsGrid assets={assets} activeThreadId={activeThreadId} loading={loading} />
        )}
        {activeTab === "missions" && (
          <MissionsList missions={missions} activeThreadId={activeThreadId} loading={loading} />
        )}
        {activeTab === "activity" && <ActivityTimeline />}
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { ChatInput } from "../ChatInput";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface CockpitStageProps {
  onSubmit: (message: string) => Promise<void>;
  connectedServices: ServiceWithConnectionStatus[];
}

interface CockpitWidget {
  id: string;
  label: string;
  hint: string;
  trigger: string;
}

const DEFAULT_WIDGETS: CockpitWidget[] = [
  {
    id: "briefing",
    label: "Brief du jour",
    hint: "Calendrier · emails · alertes",
    trigger: "Prépare mon briefing du jour",
  },
  {
    id: "agenda",
    label: "Agenda à venir",
    hint: "Réunions · slots disponibles",
    trigger: "Mon agenda d'aujourd'hui",
  },
  {
    id: "missions",
    label: "Missions actives",
    hint: "Schedulées · running · waiting",
    trigger: "Liste mes missions actives",
  },
  {
    id: "assets",
    label: "Derniers livrables",
    hint: "Rapports · drafts · audio",
    trigger: "Montre-moi mes derniers livrables",
  },
];

/**
 * CockpitStage — Home configurable, Stage par défaut au login.
 *
 * Composition canonique (4 widgets configurables) :
 * - Brief du jour (audio voice clone si dispo)
 * - Agenda à venir
 * - Missions actives
 * - Derniers livrables
 *
 * V1 : widgets hardcodés. V2 (post-Phase A) : widgets configurables par
 * user via /settings/cockpit ou drag-drop in-place. Le store dédié
 * (useCockpitStore) sera ajouté quand la persistance arrive.
 */
export function CockpitStage({ onSubmit, connectedServices }: CockpitStageProps) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0];

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Bonne nuit";
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">
      <div
        className="flex-1 flex flex-col items-center justify-center px-10 pb-16 relative z-10"
        style={{ rowGap: "var(--space-8)" }}
      >
        <div className="w-full flex flex-col items-center" style={{ maxWidth: "var(--width-center-max)", rowGap: "var(--space-8)" }}>
          {/* Greeting + cible cykan signature */}
          <div className="flex flex-col items-center gap-6 relative">
            <div
              className="relative flex items-center justify-center"
              style={{ width: "var(--space-6)", height: "var(--space-6)" }}
              aria-hidden
            >
              <span className="absolute inset-0 rounded-pill border border-[var(--cykan)]/40" />
              <span
                className="rounded-pill bg-[var(--cykan)] animate-pulse"
                style={{ width: "var(--space-1)", height: "var(--space-1)", animationDuration: "2.4s" }}
              />
            </div>

            <div className="text-center" style={{ rowGap: "var(--space-2)", display: "flex", flexDirection: "column" }}>
              <p className="t-26 font-medium tracking-tight text-[var(--text)]" style={{ lineHeight: "var(--leading-snug)" }}>
                {greeting}{firstName ? <span className="text-[var(--cykan)]">, {firstName}</span> : ""}
              </p>
              <p className="t-13 text-[var(--text-subtitle)]" style={{ lineHeight: "var(--leading-base)" }}>
                Voici ton cockpit. Choisis un widget ou écris une demande.
              </p>
            </div>
          </div>

          {/* Grid 2x2 widgets configurables */}
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--card-gap)",
              maxWidth: "calc(var(--card-width) * 2 + var(--card-gap))",
            }}
          >
            {DEFAULT_WIDGETS.map((w, i) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onSubmit(w.trigger)}
                className="halo-suggestion text-left flex items-center"
                style={{ gap: "var(--space-4)" }}
              >
                <span
                  className="halo-suggestion-logo"
                  style={{ width: "var(--space-10)", height: "var(--space-10)" }}
                  aria-hidden
                >
                  <span className="t-9 font-mono tracking-section uppercase text-[var(--text-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="t-13 font-medium tracking-tight text-[var(--text)] truncate">{w.label}</span>
                  <span className="t-9 font-mono tracking-section uppercase text-[var(--text-faint)] mt-1 truncate">{w.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ChatInput onSubmit={onSubmit} connectedServices={connectedServices} />
    </div>
  );
}

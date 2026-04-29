"use client";

import { useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ChatInput } from "../ChatInput";
import { AudioPlayer } from "../AudioPlayer";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import type { AssetVariant } from "@/lib/assets/variants";

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

type BriefingStatus = "loading" | "not_generated" | "generating" | "ready" | "failed";

interface BriefingState {
  status: BriefingStatus;
  variant?: AssetVariant;
}

function BriefingSection() {
  const [state, setState] = useState<BriefingState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/briefing");
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "not_generated" });
          return;
        }
        const data = await res.json() as { status: string; variant?: AssetVariant };
        if (cancelled) return;
        const status = (data.status as BriefingStatus) ?? "not_generated";
        setState({ status, variant: data.variant });
        if (status === "generating") {
          timer = setTimeout(poll, 5_000);
        }
      } catch {
        if (!cancelled) setState({ status: "not_generated" });
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (state.status === "loading" || state.status === "not_generated" || state.status === "failed") {
    return null;
  }

  if (state.status === "generating") {
    return (
      <div className="w-full" style={{ maxWidth: "calc(var(--card-width) * 2 + var(--card-gap))" }}>
        <div
          className="border border-[var(--surface-2)] rounded-md bg-[var(--surface-1)] flex items-center"
          style={{ padding: "var(--space-6)", gap: "var(--space-4)" }}
        >
          <span
            className="rounded-pill bg-[var(--warn)] animate-pulse"
            style={{ width: "var(--space-2)", height: "var(--space-2)", flexShrink: 0 }}
            aria-hidden
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--warn)]">
            Briefing en cours de génération…
          </span>
        </div>
      </div>
    );
  }

  if (!state.variant) return null;

  return (
    <div className="w-full" style={{ maxWidth: "calc(var(--card-width) * 2 + var(--card-gap))" }}>
      <AudioPlayer variant={state.variant} />
    </div>
  );
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

          <BriefingSection />

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

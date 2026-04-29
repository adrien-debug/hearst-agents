"use client";

import { ChatInput } from "../ChatInput";
import { CockpitInbox } from "./CockpitInbox";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface CockpitStageProps {
  onSubmit: (message: string) => Promise<void>;
  connectedServices: ServiceWithConnectionStatus[];
}

/**
 * CockpitStage — Surface d'accueil inbox-first (refonte 2026-04-29).
 *
 * Pivot vs version précédente : drop greeting "Bonjour Adrien", drop 4
 * widgets-trigger statiques, drop pulse dot décoratif, drop BriefingSection
 * (audio brief manuel reste accessible via /assets ou suggestions).
 *
 * Layout : trois sections inbox (Suggestions / Threads / Assets) qui ne
 * rendent que si elles ont du contenu. Empty state global célébratoire si
 * tout vide. ChatInput permanent en bas. Cmd+K disponible via PulseBar.
 *
 * Inspiré Linear / Cursor / Granola : pas de scaffolding, pas de greeting
 * permanent, l'utilisateur voit DIRECTEMENT ce qu'il peut faire.
 */
export function CockpitStage({ onSubmit, connectedServices }: CockpitStageProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">
      <div
        className="flex-1 flex flex-col items-center min-h-0 overflow-y-auto px-10 pt-12 pb-8 relative z-10"
      >
        <div
          className="w-full"
          style={{ maxWidth: "var(--width-center-max)" }}
        >
          <CockpitInbox />
        </div>
      </div>

      <ChatInput onSubmit={onSubmit} connectedServices={connectedServices} />
    </div>
  );
}

"use client";

import { HearstConstellation } from "./HearstConstellation";

/**
 * CockpitStage — home polymorphe (mode="cockpit").
 *
 * Rendu visuel only : la constellation Hearst en fond. L'input chat est
 * rendu une seule fois par <ChatDock /> dans app/(user)/layout.tsx — pas
 * de doublon ici. ChatDock route automatiquement vers le bon thread et
 * bascule en mode "chat" quand l'user soumet depuis le cockpit (cf. la
 * branche `if (stageMode === "cockpit")` dans ChatDock.handleSubmit).
 */
export function CockpitStage() {
  return (
    <div className="cockpit-bg flex-1 flex flex-col min-h-0 relative overflow-hidden panel-enter">
      <HearstConstellation />
    </div>
  );
}

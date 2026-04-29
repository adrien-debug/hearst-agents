/**
 * Stage Store — Zustand
 *
 * Pivot 2026-04-29 : l'app passe de chat-first à cockpit polymorphe.
 * Le Stage central peut afficher 8 modes différents :
 *
 *   - cockpit    : home configurable (briefing du jour, agenda, missions, KPIs)
 *   - chat       : conversation classique (chat + ChatMessages)
 *   - asset      : asset focus avec variants tabs (anciennement FocalStage)
 *   - browser    : session browser live co-pilotable (Browserbase)
 *   - meeting    : meeting bot live + transcript + action items extraits
 *   - kg         : Knowledge Graph explorer (Cytoscape)
 *   - voice      : overlay voix ambient temps réel (WebRTC)
 *   - simulation : DeepSeek scenarios chiffrés (Chambre de Simulation)
 *
 * Le store gère le mode actif, son payload contextuel, l'historique de
 * navigation (pour Back), et les hotkeys → mode mapping.
 */

import { create } from "zustand";

export type StageMode =
  | "cockpit"
  | "chat"
  | "asset"
  | "browser"
  | "meeting"
  | "kg"
  | "voice"
  | "simulation";

/** Payload contextuel attaché au mode (selon le Stage actif). */
export type StagePayload =
  | { mode: "cockpit" }
  | { mode: "chat"; threadId?: string }
  | { mode: "asset"; assetId: string; variantKind?: string }
  | { mode: "browser"; sessionId: string }
  | { mode: "meeting"; meetingId: string }
  | { mode: "kg"; entityId?: string; query?: string }
  | { mode: "voice"; sessionId?: string }
  | { mode: "simulation"; scenario?: string };

export interface StageEntry {
  payload: StagePayload;
  ts: number;
}

interface StageState {
  current: StagePayload;
  history: StageEntry[];
  /** Dernier asset ouvert (via TimelineRail, AssetsGrid, ou Commandeur).
   * Sert au hotkey ⌘3 pour ré-ouvrir un asset sans param explicite, et
   * permet de garder le state cross-mode (ex: revenir d'une session
   * browser au dernier asset focal). null si aucun asset n'a été ouvert. */
  lastAssetId: string | null;
  /** True quand le Commandeur (Cmd+K) est ouvert. */
  commandeurOpen: boolean;
  /** True quand le ChatInput flottant (Cmd+L) est visible au-dessus du Stage. */
  floatingChatOpen: boolean;

  /** Switch vers un nouveau mode (push dans l'history). Persiste l'assetId
   * dans `lastAssetId` quand mode === "asset". */
  setMode: (payload: StagePayload) => void;
  /** Retour au Stage précédent. No-op si history vide. */
  back: () => void;
  /** Reset à cockpit. */
  reset: () => void;

  setCommandeurOpen: (open: boolean) => void;
  setFloatingChatOpen: (open: boolean) => void;
  toggleCommandeur: () => void;
  toggleFloatingChat: () => void;
}

export const useStageStore = create<StageState>((set, get) => ({
  current: { mode: "cockpit" },
  history: [],
  lastAssetId: null,
  commandeurOpen: false,
  floatingChatOpen: false,

  setMode: (payload) => {
    const prev = get().current;
    const nextLastAssetId =
      payload.mode === "asset" ? payload.assetId : get().lastAssetId;
    set({
      current: payload,
      history: [...get().history, { payload: prev, ts: Date.now() }].slice(-20),
      lastAssetId: nextLastAssetId,
    });
  },

  back: () => {
    const hist = get().history;
    if (hist.length === 0) return;
    const last = hist[hist.length - 1];
    set({ current: last.payload, history: hist.slice(0, -1) });
  },

  reset: () => set({ current: { mode: "cockpit" }, history: [] }),

  setCommandeurOpen: (open) => set({ commandeurOpen: open }),
  setFloatingChatOpen: (open) => set({ floatingChatOpen: open }),
  toggleCommandeur: () => set({ commandeurOpen: !get().commandeurOpen }),
  toggleFloatingChat: () => set({ floatingChatOpen: !get().floatingChatOpen }),
}));

/**
 * Mapping hotkey → stage. Cmd+1..8 = switch direct vers un Stage
 * (cockpit/chat/asset/browser/meeting/kg/voice/simulation — grille
 * systématique). Cmd+K = ouvrir Commandeur. Cmd+L = toggle floating chat.
 * Cmd+Backspace = back.
 */
export const STAGE_HOTKEYS: ReadonlyArray<{ key: string; mode: StageMode }> = [
  { key: "1", mode: "cockpit" },
  { key: "2", mode: "chat" },
  { key: "3", mode: "asset" },
  { key: "4", mode: "browser" },
  { key: "5", mode: "meeting" },
  { key: "6", mode: "kg" },
  { key: "7", mode: "voice" },
  { key: "8", mode: "simulation" },
];

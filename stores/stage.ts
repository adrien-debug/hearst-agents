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
  | "asset_compare"
  | "mission"
  | "browser"
  | "meeting"
  | "kg"
  | "voice"
  | "simulation"
  | "artifact";

/** Payload contextuel attaché au mode (selon le Stage actif). */
export type StagePayload =
  | { mode: "cockpit" }
  | { mode: "chat"; threadId?: string }
  | { mode: "asset"; assetId: string; variantKind?: string }
  | { mode: "asset_compare"; assetIdA: string; assetIdB: string }
  | { mode: "mission"; missionId: string }
  | { mode: "browser"; sessionId: string }
  | { mode: "meeting"; meetingId: string }
  | { mode: "kg"; entityId?: string; query?: string }
  | { mode: "voice"; sessionId?: string }
  | { mode: "simulation"; scenario?: string }
  | { mode: "artifact"; artifactId?: string; code?: string; language?: "python" | "node" };

export interface StageEntry {
  payload: StagePayload;
  ts: number;
}

interface StageState {
  current: StagePayload;
  history: StageEntry[];
  /** Dernier asset ouvert (via TimelineRail ou Commandeur). Sert au
   * hotkey ⌘3 pour ré-ouvrir un asset sans param explicite, et permet
   * de garder le state cross-mode (ex: revenir d'une session browser
   * au dernier asset focal). null si aucun asset n'a été ouvert. */
  lastAssetId: string | null;
  /** Dernière mission ouverte (via /missions, GeneralDashboard, ou
   * Commandeur). Sert au hotkey ⌘9 pour ré-ouvrir le dernier MissionStage
   * sans param explicite. null si aucune mission n'a été ouverte. */
  lastMissionId: string | null;
  /** True quand le Commandeur (Cmd+K) est ouvert. */
  commandeurOpen: boolean;
  /** Query préremplie au prochain ouvrage du Commandeur. Consommée après lecture. */
  commandeurPrefilledQuery: string | null;

  /** Switch vers un nouveau mode (push dans l'history). Persiste l'assetId
   * dans `lastAssetId` quand mode === "asset". */
  setMode: (payload: StagePayload) => void;
  /** Retour au Stage précédent. No-op si history vide. */
  back: () => void;
  /** Reset à cockpit. */
  reset: () => void;

  setCommandeurOpen: (open: boolean, options?: { prefilledQuery?: string }) => void;
  toggleCommandeur: () => void;
  /** Consomme la query préremplie (lecture + reset à null). */
  consumeCommandeurPrefilledQuery: () => string | null;
}

export const useStageStore = create<StageState>((set, get) => ({
  current: { mode: "chat" },
  history: [],
  lastAssetId: null,
  lastMissionId: null,
  commandeurOpen: false,
  commandeurPrefilledQuery: null,

  setMode: (payload) => {
    const prev = get().current;
    const nextLastAssetId =
      payload.mode === "asset" ? payload.assetId : get().lastAssetId;
    const nextLastMissionId =
      payload.mode === "mission" ? payload.missionId : get().lastMissionId;
    set({
      current: payload,
      history: [...get().history, { payload: prev, ts: Date.now() }].slice(-20),
      lastAssetId: nextLastAssetId,
      lastMissionId: nextLastMissionId,
    });
  },

  back: () => {
    const hist = get().history;
    if (hist.length === 0) return;
    const last = hist[hist.length - 1];
    set({ current: last.payload, history: hist.slice(0, -1) });
  },

  reset: () => set({ current: { mode: "chat" }, history: [] }),

  setCommandeurOpen: (open, options) =>
    set({
      commandeurOpen: open,
      commandeurPrefilledQuery: open
        ? (options?.prefilledQuery ?? get().commandeurPrefilledQuery)
        : null,
    }),
  toggleCommandeur: () => set({ commandeurOpen: !get().commandeurOpen }),
  consumeCommandeurPrefilledQuery: () => {
    const q = get().commandeurPrefilledQuery;
    if (q !== null) set({ commandeurPrefilledQuery: null });
    return q;
  },
}));

/**
 * Mapping hotkey → stage. Cmd+1..9 = switch direct vers un Stage
 * (cockpit/chat/asset/browser/meeting/kg/voice/simulation/mission —
 * grille systématique). Cmd+0 = ArtifactStage (B8 code/E2B).
 * Cmd+K = ouvrir Commandeur. Cmd+Backspace = back.
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
  { key: "9", mode: "mission" },
  { key: "0", mode: "artifact" },
];

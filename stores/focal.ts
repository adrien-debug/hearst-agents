/**
 * Focal Store — Zustand
 *
 * Gère les objets focaux (briefs, reports, messages, missions).
 * Remplace : useFocalObject + manifestation logic
 */

import { create } from "zustand";

export type FocalType =
  | "message_draft"
  | "message_receipt"
  | "brief"
  | "outline"
  | "report"
  | "doc"
  | "watcher_draft"
  | "watcher_active"
  | "mission_draft"
  | "mission_active";

export type FocalStatus =
  | "composing"
  | "ready"
  | "awaiting_approval"
  | "delivering"
  | "delivered"
  | "active"
  | "paused"
  | "failed";

export interface FocalObject {
  id: string;
  type: FocalType;
  status: FocalStatus;
  title: string;
  body?: string;
  summary?: string;
  sections?: { heading?: string; body: string }[];
  wordCount?: number;
  provider?: string;
  createdAt: number;
  updatedAt: number;
  /** Thread ID pour traçabilité et continuité */
  threadId?: string;
  /** Source plan ID si dérivé d'un plan d'exécution */
  sourcePlanId?: string;
  /** Source asset ID si dérivé d'un asset stocké */
  sourceAssetId?: string;
  /** Mission ID pour actions pause/resume sur missions/watchers */
  missionId?: string;
  /** Cible de morphing possible (ex: message_draft → message_receipt) */
  morphTarget?: string | null;
  /** Action primaire affichable (approve, discard, pause, resume, etc.) */
  primaryAction?: {
    kind: string;
    label: string;
  };
}

interface FocalState {
  // Current focal
  focal: FocalObject | null;
  setFocal: (focal: FocalObject | null) => void;
  clearFocal: () => void;

  // Secondary objects (historical)
  secondary: FocalObject[];
  addSecondary: (obj: FocalObject) => void;
  clearSecondary: () => void;

  // Derived
  isFocused: boolean;
  hasContent: boolean;

  /**
   * Visibilité du focal stage plein écran. `setFocal(obj)` la passe à true
   * automatiquement (clic asset/mission card). `hide()` la passe à false
   * sans toucher à `focal` lui-même — l'utilisateur peut rouvrir via show().
   */
  isVisible: boolean;
  show: () => void;
  hide: () => void;

  /**
   * Monotonic counter incremented on every explicit `setFocal` call (i.e.
   * user clicked an asset/mission card). Lu par `hydrateThreadState` pour
   * protéger pendant 30s le focal user-cliqué contre l'écrasement par le
   * polling SSE. Auto-rehydratation (hydrateThreadState) does NOT bump this.
   */
  viewRequestedAt: number;

  // Thread rehydratation — replaces focal and secondary atomically
  hydrateThreadState: (focal: FocalObject | null, secondary: FocalObject[]) => void;
}

// Helper to detect error content
function isValidContent(obj: FocalObject): boolean {
  const errorPatterns = [
    "Aucun email trouvé",
    "Aucun fichier trouvé",
    "Accès non autorisé",
    "Erreur",
    "Error",
    "[Gmail]",
    "[Slack]",
  ];

  const content = obj.body || obj.summary || "";
  return !errorPatterns.some((pattern) => content.includes(pattern));
}

export const useFocalStore = create<FocalState>((set, get) => ({
  // Initial state
  focal: null,
  secondary: [],
  isFocused: false,
  hasContent: false,
  isVisible: false,
  viewRequestedAt: 0,

  // Actions
  setFocal: (focal) => {
    if (focal && !isValidContent(focal)) {
      console.warn("[FocalStore] Rejected focal with error content:", focal.title);
      return;
    }

    // Move current focal to secondary if exists
    const current = get().focal;
    if (current) {
      set((state) => ({
        secondary: [current, ...state.secondary].slice(0, 3),
      }));
    }

    set({
      focal,
      isFocused: !!focal,
      hasContent: !!focal?.body || !!focal?.summary,
      isVisible: !!focal,
      viewRequestedAt: Date.now(),
    });
  },

  clearFocal: () => set({ focal: null, isFocused: false, hasContent: false, isVisible: false }),

  show: () => set((state) => (state.focal ? { isVisible: true } : {})),
  hide: () => set({ isVisible: false }),

  addSecondary: (obj) =>
    set((state) => ({
      secondary: [obj, ...state.secondary].slice(0, 3),
    })),

  clearSecondary: () => set({ secondary: [] }),

  // Atomic rehydratation for thread switch / hard reload.
  //
  // Important: this is called by the SSE poll every ~1s, so it must NOT
  // overwrite a focal the user just opened by clicking an asset / mission
  // card in the right panel — otherwise the preview vanishes a second after
  // it's clicked. We preserve the user-selected focal if it was set within
  // the last 30s and points to a different asset/mission than the SSE one.
  hydrateThreadState: (newFocal, newSecondary) => {
    const state = get();
    const now = Date.now();
    const userPicked =
      !!state.focal &&
      state.viewRequestedAt > 0 &&
      now - state.viewRequestedAt < 30_000 &&
      (!!state.focal.sourceAssetId || !!state.focal.missionId);
    const sameAsCurrent =
      !!newFocal && !!state.focal && newFocal.id === state.focal.id;

    if (userPicked && !sameAsCurrent) {
      // Keep the user's focal selection, only update secondary list.
      set({ secondary: newSecondary.slice(0, 3) });
      return;
    }

    // Validate focal content
    if (newFocal && !isValidContent(newFocal)) {
      console.warn("[FocalStore] Rejected hydrated focal with error content:", newFocal.title);
      set({
        focal: null,
        secondary: newSecondary.slice(0, 3),
        isFocused: false,
        hasContent: false,
      });
      return;
    }

    // Atomic replace — no movement of old focal to secondary
    set({
      focal: newFocal,
      secondary: newSecondary.slice(0, 3),
      isFocused: !!newFocal,
      hasContent: !!newFocal?.body || !!newFocal?.summary,
    });
  },
}));

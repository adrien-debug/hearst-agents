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
    });
  },

  clearFocal: () => set({ focal: null, isFocused: false, hasContent: false }),

  addSecondary: (obj) =>
    set((state) => ({
      secondary: [obj, ...state.secondary].slice(0, 3),
    })),

  clearSecondary: () => set({ secondary: [] }),
}));

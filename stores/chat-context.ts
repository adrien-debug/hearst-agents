/**
 * Chat Context Store — Zustand
 *
 * État partagé pour la zone de saisie « Thinking Canvas » :
 *  - `chips` : sources de contexte actives (topic, asset, mission, report)
 *    affichées au-dessus du textarea sous forme de pills removables.
 *
 * Persistance : zustand `persist` (localStorage `hearst-chat-context`) afin
 * que la sélection survive aux navigations / reloads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChipKind = "topic" | "asset" | "mission" | "report";

export interface ContextChip {
  id: string;
  label: string;
  kind: ChipKind;
  payload?: Record<string, unknown>;
}

interface ChatContextState {
  chips: ContextChip[];
  addChip: (chip: ContextChip) => void;
  removeChip: (id: string) => void;
  clearChips: () => void;
}

export const useChatContext = create<ChatContextState>()(
  persist(
    (set) => ({
      chips: [],
      addChip: (chip) =>
        set((state) => {
          if (state.chips.some((c) => c.id === chip.id)) return state;
          return { chips: [...state.chips, chip] };
        }),
      removeChip: (id) =>
        set((state) => ({ chips: state.chips.filter((c) => c.id !== id) })),
      clearChips: () => set({ chips: [] }),
    }),
    {
      name: "hearst-chat-context",
      version: 1,
      partialize: (state) => ({
        chips: state.chips,
      }),
    },
  ),
);

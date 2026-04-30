/**
 * Chat Context Store — Zustand
 *
 * État partagé pour la zone de saisie « Thinking Canvas » :
 *  - `chips` : sources de contexte actives (topic, asset, mission, report)
 *    affichées au-dessus du textarea sous forme de pills removables.
 *  - `inputMode` : mode d'intention (« ask » / « analyze » / « create »)
 *    qui influencera plus tard le system-prompt côté Lot C.
 *
 * Persistance : zustand `persist` (localStorage `hearst-chat-context`) afin
 * que la sélection survive aux navigations / reloads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChipKind = "topic" | "asset" | "mission" | "report";
export type InputMode = "ask" | "analyze" | "create";

export interface ContextChip {
  id: string;
  label: string;
  kind: ChipKind;
  payload?: Record<string, unknown>;
}

interface ChatContextState {
  chips: ContextChip[];
  inputMode: InputMode;
  addChip: (chip: ContextChip) => void;
  removeChip: (id: string) => void;
  clearChips: () => void;
  setInputMode: (mode: InputMode) => void;
}

export const useChatContext = create<ChatContextState>()(
  persist(
    (set) => ({
      chips: [],
      inputMode: "ask",
      addChip: (chip) =>
        set((state) => {
          if (state.chips.some((c) => c.id === chip.id)) return state;
          return { chips: [...state.chips, chip] };
        }),
      removeChip: (id) =>
        set((state) => ({ chips: state.chips.filter((c) => c.id !== id) })),
      clearChips: () => set({ chips: [] }),
      setInputMode: (mode) => set({ inputMode: mode }),
    }),
    {
      name: "hearst-chat-context",
      version: 1,
      partialize: (state) => ({
        chips: state.chips,
        inputMode: state.inputMode,
      }),
    },
  ),
);

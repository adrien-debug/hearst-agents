/**
 * OAuth Store — Zustand
 *
 * Suit l'état d'un flow OAuth en cours pendant qu'une popup window est
 * ouverte. Permet au RightPanel d'afficher une carte de statut sans que
 * l'utilisateur quitte l'application principale.
 *
 * Cycle : idle → opening (popup créée) → active (URL OAuth chargée) →
 * success | error | cancelled (postMessage du callback ou popup fermée
 * sans completer).
 */

import { create } from "zustand";

export type OAuthStatus =
  | "idle"
  | "opening"
  | "active"
  | "success"
  | "error"
  | "cancelled";

interface OAuthState {
  slug: string | null;
  appName: string | null;
  status: OAuthStatus;
  errorMessage: string | null;
  // La popup window n'est pas sérialisable. Le store n'est pas persisté
  // donc c'est safe. `clear()` la met à null sans la fermer (la popup peut
  // se fermer toute seule via window.close après postMessage).
  popup: Window | null;

  start: (params: { slug: string; appName: string; popup: Window | null }) => void;
  setStatus: (status: OAuthStatus, errorMessage?: string | null) => void;
  focusPopup: () => void;
  clear: () => void;
}

export const useOAuthStore = create<OAuthState>((set, get) => ({
  slug: null,
  appName: null,
  status: "idle",
  errorMessage: null,
  popup: null,

  start: ({ slug, appName, popup }) =>
    set({
      slug,
      appName,
      popup,
      status: "opening",
      errorMessage: null,
    }),

  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),

  focusPopup: () => {
    const { popup } = get();
    if (popup && !popup.closed) popup.focus();
  },

  clear: () =>
    set({
      slug: null,
      appName: null,
      status: "idle",
      errorMessage: null,
      popup: null,
    }),
}));

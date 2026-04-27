/**
 * Services Store — Zustand
 *
 * État partagé des connecteurs (Composio) consommé par la TopBar, le main
 * et le RightPanel. page.tsx reste responsable du fetch et de la gestion
 * du retour OAuth — il pousse simplement le résultat ici pour que les
 * surfaces de chrome (TopBar) puissent l'afficher sans dupliquer le call.
 */

import { create } from "zustand";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { getAllServices } from "@/lib/integrations/catalog";

const initialServices: ServiceWithConnectionStatus[] = getAllServices().map((s) => ({
  ...s,
  connectionStatus: "disconnected" as const,
}));

interface ServicesState {
  services: ServiceWithConnectionStatus[];
  loaded: boolean;
  setServices: (services: ServiceWithConnectionStatus[]) => void;
  setLoaded: (loaded: boolean) => void;
}

export const useServicesStore = create<ServicesState>((set) => ({
  services: initialServices,
  loaded: false,
  setServices: (services) => set({ services }),
  setLoaded: (loaded) => set({ loaded }),
}));

"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Surface } from "./missions/types";

export interface SelectedItem {
  type: "message" | "event" | "file" | "task";
  id: string;
  title: string;
  from?: string;
  preview?: string;
  provider?: string;
}

export interface ChatContextValue {
  surface: Surface;
  selectedItem: SelectedItem | null;
  connectedServices: string[];
  expanded: boolean;
  setSurface: (s: Surface) => void;
  setSelectedItem: (item: SelectedItem | null) => void;
  setConnectedServices: (services: string[]) => void;
  setExpanded: (v: boolean) => void;
  toggleExpanded: () => void;
  getContextHint: () => string;
}

const ChatCtx = createContext<ChatContextValue | null>(null);

const SURFACE_LABELS: Record<Surface, string> = {
  home: "accueil",
  inbox: "boîte de réception",
  calendar: "agenda",
  files: "fichiers",
  tasks: "tâches",
  apps: "applications",
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>("home");
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [connectedServices, setConnectedServices] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  const getContextHint = useCallback(() => {
    if (selectedItem) {
      const label = selectedItem.from
        ? `${selectedItem.title} de ${selectedItem.from}`
        : selectedItem.title;
      return `Vous consultez : ${label}`;
    }
    if (surface !== "home") {
      return `Vous êtes dans ${SURFACE_LABELS[surface]}`;
    }
    return "";
  }, [surface, selectedItem]);

  const value = useMemo<ChatContextValue>(
    () => ({
      surface,
      selectedItem,
      connectedServices,
      expanded,
      setSurface,
      setSelectedItem,
      setConnectedServices,
      setExpanded,
      toggleExpanded,
      getContextHint,
    }),
    [surface, selectedItem, connectedServices, expanded, toggleExpanded, getContextHint],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}

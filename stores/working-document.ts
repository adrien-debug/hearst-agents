/**
 * Working Document Store — Zustand
 *
 * Gère le panneau "document de travail" qui s'ouvre à droite quand
 * l'utilisateur expand un block AI dans le chat. Volatil au refresh
 * (pas de persist) — c'est un brouillon expandé, pas une source de
 * vérité durable.
 *
 * Évolution Lot C : la "Thinking Canvas" se compose du chat à gauche
 * + ce document à droite. L'event `chat:expand-block` (émis par
 * BlockActions du Lot A) déclenche `open()` côté WorkingDocument.tsx.
 */

import { create } from "zustand";

export interface WorkingDocument {
  id: string;
  title: string;
  /** Contenu markdown du block expandé. Éditable inline. */
  content: string;
  /** Id du message chat source (pour traçabilité / réinjection). */
  sourceMessageId?: string;
  createdAt: number;
}

export interface WorkingDocumentState {
  current: WorkingDocument | null;
  isOpen: boolean;
  open: (doc: Omit<WorkingDocument, "id" | "createdAt">) => void;
  close: () => void;
  updateContent: (content: string) => void;
  updateTitle: (title: string) => void;
  toggle: () => void;
}

function generateId(): string {
  // crypto.randomUUID est dispo dans tous les navigateurs modernes + Node 19+.
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `wd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useWorkingDocumentStore = create<WorkingDocumentState>((set, get) => ({
  current: null,
  isOpen: false,

  open: (doc) => {
    set({
      current: {
        id: generateId(),
        title: doc.title,
        content: doc.content,
        sourceMessageId: doc.sourceMessageId,
        createdAt: Date.now(),
      },
      isOpen: true,
    });
  },

  close: () => set({ isOpen: false }),

  updateContent: (content) => {
    const current = get().current;
    if (!current) return;
    set({ current: { ...current, content } });
  },

  updateTitle: (title) => {
    const current = get().current;
    if (!current) return;
    set({ current: { ...current, title } });
  },

  toggle: () => {
    const { isOpen, current } = get();
    if (isOpen) {
      set({ isOpen: false });
      return;
    }
    // Toggle ré-ouvre uniquement si un document existe (sinon no-op).
    if (current) {
      set({ isOpen: true });
    }
  },
}));

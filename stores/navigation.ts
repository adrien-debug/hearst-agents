/**
 * Navigation Store — Zustand
 *
 * Gère sidebar, threads, surface state.
 * Remplace : SidebarContext + SurfaceContext
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Surface = "home" | "inbox" | "calendar" | "files" | "tasks" | "apps" | "settings";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Thread {
  id: string;
  name: string;
  surface: Surface;
  lastActivity: number;
}

interface NavigationState {
  // Sidebar
  isOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Left rail collapse (desktop)
  leftCollapsed: boolean;
  toggleLeftCollapsed: () => void;

  // Surface
  surface: Surface;
  setSurface: (surface: Surface) => void;

  // Threads
  threads: Thread[];
  activeThreadId: string | null;
  addThread: (name: string, surface: Surface) => string;
  setActiveThread: (id: string | null) => void;
  updateThreadName: (id: string, name: string) => void;
  removeThread: (id: string) => void;

  // Messages per thread
  messages: Record<string, Message[]>;
  addMessageToThread: (threadId: string, message: Message) => void;
  updateMessageInThread: (threadId: string, messageId: string, content: string) => void;
  clearThreadMessages: (threadId: string) => void;
  getThreadMessages: (threadId: string) => Message[];
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOpen: true,
      leftCollapsed: false,
      surface: "home",
      threads: [{ id: "default", name: "Accueil", surface: "home", lastActivity: Date.now() }],
      activeThreadId: "default",
      messages: {},

      // Sidebar
      toggleSidebar: () => set((state) => ({ isOpen: !state.isOpen })),
      setSidebarOpen: (open) => set({ isOpen: open }),

      // Left rail collapse
      toggleLeftCollapsed: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),

      // Surface
      setSurface: (surface) => {
        set({ surface });
        // Update active thread surface
        const { activeThreadId } = get();
        if (activeThreadId) {
          set((state) => ({
            threads: state.threads.map((t) =>
              t.id === activeThreadId ? { ...t, surface, lastActivity: Date.now() } : t
            ),
          }));
        }
      },

      // Threads
      addThread: (name, surface) => {
        const id = `thread-${Date.now()}`;
        set((state) => ({
          threads: [
            { id, name, surface, lastActivity: Date.now() },
            ...state.threads,
          ],
          activeThreadId: id,
        }));
        return id;
      },

      setActiveThread: (id) => {
        set({ activeThreadId: id });
        if (id) {
          const thread = get().threads.find((t) => t.id === id);
          if (thread) {
            set({ surface: thread.surface });
          }
        }
      },

      updateThreadName: (id, name) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, name, lastActivity: Date.now() } : t
          ),
        })),

      removeThread: (id) =>
        set((state) => {
          const newThreads = state.threads.filter((t) => t.id !== id);
          const newActiveId = state.activeThreadId === id
            ? newThreads[0]?.id || null
            : state.activeThreadId;
          // Also clean up messages for removed thread
          const { [id]: _, ...remainingMessages } = state.messages;
          return { 
            threads: newThreads, 
            activeThreadId: newActiveId,
            messages: remainingMessages 
          };
        }),

      // Messages per thread
      addMessageToThread: (threadId, message) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [threadId]: [...(state.messages[threadId] || []), message],
          },
        })),

      updateMessageInThread: (threadId, messageId, content) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [threadId]: (state.messages[threadId] || []).map((m) =>
              m.id === messageId ? { ...m, content } : m
            ),
          },
        })),

      clearThreadMessages: (threadId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [threadId]: [],
          },
        })),

      getThreadMessages: (threadId) => {
        return get().messages[threadId] || [];
      },
    }),
    {
      name: "hearst-navigation",
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        surface: state.surface,
        messages: state.messages,
        leftCollapsed: state.leftCollapsed,
      }),
    }
  )
);

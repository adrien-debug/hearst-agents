/**
 * Voice Store — Zustand
 *
 * Signature 6 — Pulse Vocal Ambient. État partagé entre VoicePulse
 * (qui pilote WebRTC) et VoiceStage (qui visualise transcript + niveau
 * audio). Phase B suivante : function calling Composio + persistance
 * transcript par thread.
 */

import { create } from "zustand";

export type VoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export type TranscriptRole = "user" | "assistant" | "tool_call" | "tool_result";

export interface TranscriptEntry {
  id: string;
  role: TranscriptRole;
  text: string;
  timestamp: number;
  /** Function calling : id alloué par OpenAI Realtime, sert à apparier
   * tool_call ↔ tool_result. */
  callId?: string;
  /** Function calling : nom du tool (ex `GMAIL_SEND_EMAIL`). */
  toolName?: string;
  /** Function calling : args passés au tool. Tronqués au niveau UI. */
  args?: Record<string, unknown>;
  /** Function calling : output renvoyé au modèle, pour le tool_result. */
  output?: string;
  /** Function calling : statut visuel utilisé par les receipts. */
  status?: "pending" | "success" | "error";
  /** Function calling : provider attribuer (ex `gmail`, `slack`, `composio`). */
  providerId?: string;
}

interface VoiceState {
  phase: VoicePhase;
  sessionId: string | null;
  transcript: TranscriptEntry[];
  /** RMS du mic, normalisé 0..1. */
  audioLevel: number;
  error: string | null;
  /** True quand le pipeline WebRTC doit être actif. Le composant VoicePulse
   * est monté au root layout et ne se connecte que si ce flag passe à true.
   * Évite le mount/unmount catastrophique sur chaque navigation Stage qui
   * accumulait des sessions OpenAI Realtime concurrentes. */
  voiceActive: boolean;

  setPhase: (phase: VoicePhase) => void;
  setSessionId: (id: string | null) => void;
  appendTranscript: (entry: TranscriptEntry) => void;
  /** Concatène un delta au texte d'une entry existante (assistant streaming). */
  updateLastTranscript: (id: string, deltaOrText: string) => void;
  /** Patch une entry par id (utilisé pour passer un tool_call de pending →
   * success/error sans en créer une nouvelle). */
  patchTranscriptEntry: (id: string, patch: Partial<TranscriptEntry>) => void;
  setAudioLevel: (level: number) => void;
  setError: (err: string | null) => void;
  setVoiceActive: (active: boolean) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  phase: "idle",
  sessionId: null,
  transcript: [],
  audioLevel: 0,
  error: null,
  voiceActive: false,

  setPhase: (phase) => set({ phase }),
  setSessionId: (id) => set({ sessionId: id }),
  appendTranscript: (entry) =>
    set((state) => ({ transcript: [...state.transcript, entry] })),
  updateLastTranscript: (id, delta) =>
    set((state) => ({
      transcript: state.transcript.map((entry) =>
        entry.id === id ? { ...entry, text: entry.text + delta } : entry,
      ),
    })),
  patchTranscriptEntry: (id, patch) =>
    set((state) => ({
      transcript: state.transcript.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    })),
  setAudioLevel: (level) => set({ audioLevel: level }),
  setError: (err) => set({ error: err }),
  setVoiceActive: (active) => set({ voiceActive: active }),
  reset: () =>
    set({
      phase: "idle",
      sessionId: null,
      transcript: [],
      audioLevel: 0,
      error: null,
      // voiceActive volontairement omis — il est piloté par les actions
      // utilisateur (setVoiceActive), pas par les cleanups WebRTC. Sinon
      // boucle teardown → reset → unmount → teardown qui coupait le son.
    }),
}));

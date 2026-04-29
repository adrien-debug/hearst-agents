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

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
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

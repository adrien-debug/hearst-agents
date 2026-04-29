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

  setPhase: (phase: VoicePhase) => void;
  setSessionId: (id: string | null) => void;
  appendTranscript: (entry: TranscriptEntry) => void;
  /** Concatène un delta au texte d'une entry existante (assistant streaming). */
  updateLastTranscript: (id: string, deltaOrText: string) => void;
  setAudioLevel: (level: number) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  phase: "idle",
  sessionId: null,
  transcript: [],
  audioLevel: 0,
  error: null,

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
  reset: () =>
    set({
      phase: "idle",
      sessionId: null,
      transcript: [],
      audioLevel: 0,
      error: null,
    }),
}));

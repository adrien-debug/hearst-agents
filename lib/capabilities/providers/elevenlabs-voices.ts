/**
 * ElevenLabs Voice Mapping — Choisit la voix + voice_settings adaptés
 * au tone d'une persona Hearst.
 *
 * Avant ce module, toute la TTS partait sur Rachel (21m00...) avec
 * stability 0.5 / similarity 0.75 hardcoded. Résultat : un assistant
 * "formal Senior Advisor" parlait avec la même voix vivace qu'un buddy
 * casual. On remap par tone.
 *
 * Sources des voice IDs : "Premade voices" ElevenLabs (publics, pas de
 * clonage requis). Cf. https://elevenlabs.io/docs/api-reference/voices
 *
 * Tuning voice_settings :
 *   - stability ↑ (0.7-0.8) → diction posée, peu de variation prosodique
 *   - stability ↓ (0.4-0.5) → expressif, vivant
 *   - similarity_boost ↑ → reste fidèle au timbre original
 *   - style ↑ → exagère le style de la voix de référence
 */

export type PersonaTone =
  | "formal"
  | "direct"
  | "analytical"
  | "casual"
  | "warm-professional"
  | "creative"
  | "default";

export interface VoiceProfile {
  voiceId: string;
  /** Label humain pour debug + provenance UI */
  label: string;
  stability: number;
  similarityBoost: number;
  /** Style 0-1 — exagération du style. ElevenLabs v2 multilingual support. */
  style: number;
  /** Hint pour `useSpeakerBoost`. Renforce la similarité tonale. */
  useSpeakerBoost?: boolean;
}

/**
 * Voice IDs — Premade voices ElevenLabs (pas besoin de clonage).
 * Source : https://elevenlabs.io/docs/voices/premade-voices
 */
const VOICES = {
  // Voix masculines posées
  Adam: "pNInz6obpgDQGcFmaJgB", // grave américain, posé
  Antoni: "ErXwobaYiN019PkySvjV", // jeune américain, chaleureux
  // Voix masculines vives
  Sam: "yoZ06aMxZJJ28mfd3POQ", // jeune dynamique
  Josh: "TxGEqnHWrfWFTfGW9XjX", // grave conversationnel
  // Voix féminines
  Rachel: "21m00Tcm4TlvDq8ikWAM", // neutre claire (default historique)
  Domi: "AZnzlk1XvdvUeBnXmlld", // jeune confiante
  Bella: "EXAVITQu4vr4xnSDxMaL", // jeune douce
  Elli: "MF3mGyEYCl7XYWbV9V6O", // jeune émotive
  // Voix matures
  Charlotte: "XB0fDUnXU5powFXDhCwa", // mature posée féminine
  Daniel: "onwK4e9ZLuTAKqWW03F9", // mature posé masculin (BBC-like)
} as const;

/**
 * Mapping persona tone → VoiceProfile. Couvre les tones définis dans
 * lib/personas (formal/direct/analytical/casual/warm-professional/creative).
 */
const TONE_MAP: Record<PersonaTone, VoiceProfile> = {
  // Senior Advisor / Board member — voix grave masculine, diction posée
  formal: {
    voiceId: VOICES.Daniel,
    label: "Daniel — formal masculine",
    stability: 0.75,
    similarityBoost: 0.85,
    style: 0.2,
    useSpeakerBoost: true,
  },
  // Default conversationnel — Rachel, neutre claire
  direct: {
    voiceId: VOICES.Rachel,
    label: "Rachel — neutral direct",
    stability: 0.55,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  // Analyste / Strategist — voix mature féminine, calme et autoritaire
  analytical: {
    voiceId: VOICES.Charlotte,
    label: "Charlotte — analytical mature feminine",
    stability: 0.75,
    similarityBoost: 0.85,
    style: 0.2,
    useSpeakerBoost: true,
  },
  // Buddy / Coach informel — voix jeune dynamique
  casual: {
    voiceId: VOICES.Sam,
    label: "Sam — casual youthful",
    stability: 0.45,
    similarityBoost: 0.65,
    style: 0.5,
    useSpeakerBoost: true,
  },
  // Concierge hospitality — voix chaleureuse équilibrée
  "warm-professional": {
    voiceId: VOICES.Antoni,
    label: "Antoni — warm professional",
    stability: 0.6,
    similarityBoost: 0.75,
    style: 0.35,
    useSpeakerBoost: true,
  },
  // Créatif / pitch — voix expressive
  creative: {
    voiceId: VOICES.Bella,
    label: "Bella — creative expressive",
    stability: 0.4,
    similarityBoost: 0.7,
    style: 0.55,
    useSpeakerBoost: true,
  },
  // Fallback
  default: {
    voiceId: VOICES.Rachel,
    label: "Rachel — default",
    stability: 0.55,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
};

/**
 * Résout un tone en VoiceProfile. Tone inconnu → default (Rachel).
 */
export function resolveVoiceProfile(tone?: string | null): VoiceProfile {
  if (!tone) return TONE_MAP.default;
  const normalized = tone.toLowerCase().trim() as PersonaTone;
  return TONE_MAP[normalized] ?? TONE_MAP.default;
}

/** Liste les tones supportés (pour validation API). */
export const SUPPORTED_TONES: PersonaTone[] = Object.keys(TONE_MAP) as PersonaTone[];

/** Expose le mapping pour debug / admin UI. */
export function listVoiceProfiles(): Array<{ tone: PersonaTone; profile: VoiceProfile }> {
  return SUPPORTED_TONES.map((tone) => ({ tone, profile: TONE_MAP[tone] }));
}

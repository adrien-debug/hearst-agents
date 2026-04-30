/**
 * OpenAI Realtime Voice Mapping — Choisit la voix Realtime qui matche
 * le tone de la persona active.
 *
 * Avant : `voice: "alloy"` était hardcodé dans `mintRealtimeSession` →
 * un Senior Advisor "formal" parlait avec la même voix qu'un coach casual.
 *
 * 8 voix disponibles côté OpenAI Realtime (gpt-4o-realtime-preview) :
 *   alloy, ash, ballad, coral, echo, sage, shimmer, verse
 *
 * Mapping persona tone → voice :
 *   formal             → ash    (grave, posée)
 *   analytical         → sage   (mature, calme)
 *   direct             → alloy  (neutre — défaut historique)
 *   casual             → coral  (vivante, jeune)
 *   warm-professional  → ballad (chaleureuse)
 *   creative           → verse  (expressive)
 */

export type RealtimeVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse";

export type PersonaTone =
  | "formal"
  | "direct"
  | "analytical"
  | "casual"
  | "warm-professional"
  | "creative"
  | "default";

const TONE_TO_VOICE: Record<PersonaTone, RealtimeVoice> = {
  formal: "ash",
  analytical: "sage",
  direct: "alloy",
  casual: "coral",
  "warm-professional": "ballad",
  creative: "verse",
  default: "alloy",
};

/** Voix Realtime par défaut (Rachel-equivalent ChatGPT). */
export const DEFAULT_REALTIME_VOICE: RealtimeVoice = "alloy";

/** Liste des 8 voix supportées par gpt-4o-realtime-preview. */
export const SUPPORTED_REALTIME_VOICES: RealtimeVoice[] = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
];

/**
 * Résout un tone de persona → voix Realtime. Tone inconnu/null → alloy.
 */
export function resolveRealtimeVoice(tone?: string | null): RealtimeVoice {
  if (!tone) return DEFAULT_REALTIME_VOICE;
  const normalized = tone.toLowerCase().trim() as PersonaTone;
  return TONE_TO_VOICE[normalized] ?? DEFAULT_REALTIME_VOICE;
}

/**
 * Résout un personaId en voix Realtime. Si la persona n'est pas trouvée
 * ou n'a pas de tone, retombe sur "alloy".
 *
 * NOTE: cette fonction est synchrone et stateless — pour les personas
 * dynamiques, le caller doit pré-résoudre le tone et passer via
 * `resolveRealtimeVoice(tone)` directement.
 */
export function getVoiceForPersona(
  personaId: string | undefined,
  toneByPersonaId?: Record<string, string | undefined>,
): RealtimeVoice {
  if (!personaId) return DEFAULT_REALTIME_VOICE;
  const tone = toneByPersonaId?.[personaId];
  return resolveRealtimeVoice(tone);
}

/** Liste exhaustive du mapping pour debug + admin UI. */
export function listVoiceMapping(): Array<{ tone: PersonaTone; voice: RealtimeVoice }> {
  return (Object.entries(TONE_TO_VOICE) as Array<[PersonaTone, RealtimeVoice]>).map(
    ([tone, voice]) => ({ tone, voice }),
  );
}

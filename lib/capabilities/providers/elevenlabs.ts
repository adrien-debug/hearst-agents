/**
 * ElevenLabs provider — TTS (text-to-speech) + voice clone.
 *
 * V1 Phase B.1 : TTS uniquement. Voice clone arrivera en Phase B.1bis
 * (endpoint /v1/voices/add avec sample audio user).
 *
 * Pricing (avril 2026) :
 *  - Free 10k chars/mo (sans carte)
 *  - Starter $5/mo : 30k chars/mo (+ Voice Clone instant)
 *  - Creator $22/mo : 100k chars + clones haute qualité
 *  - Cost per char (production estimate) : ~$0.000167 (Starter) à $0.000050 (Pro)
 *
 * Modèles :
 *  - eleven_multilingual_v2 : qualité haute, latence ~3-5s pour 500 chars
 *  - eleven_turbo_v2_5      : faible latence (~1-2s), qualité bonne
 *  - eleven_flash_v2_5      : ultra faible latence (<1s) pour realtime
 */

import { Buffer } from "node:buffer";
import {
  resolveVoiceProfile,
  type VoiceProfile,
} from "./elevenlabs-voices";

const ELEVEN_API_BASE = "https://api.elevenlabs.io/v1";

// Voix par défaut publiques ElevenLabs (Pre-made voices, pas besoin de clone)
export const ELEVEN_DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — neutre claire FR/EN
export const ELEVEN_DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export interface SynthesizeSpeechInput {
  text: string;
  voiceId?: string;
  modelId?: string;
  /** Voice settings ElevenLabs (stability 0-1, similarity_boost 0-1). */
  stability?: number;
  similarityBoost?: number;
  /** Style 0-1 (ElevenLabs v2). */
  style?: number;
  /** Renforce la similarité tonale. */
  useSpeakerBoost?: boolean;
  /** Tone de la persona active — résout en voiceId + voice_settings via
   *  `resolveVoiceProfile`. Ignoré si `voiceId` est explicitement passé. */
  personaTone?: string;
  /** Profil voix pré-résolu (override total). */
  voiceProfile?: VoiceProfile;
}

export interface SynthesizeSpeechResult {
  audio: Buffer;
  charCount: number;
  costUsd: number;
  modelUsed: string;
  voiceUsed: string;
}

const MULTILINGUAL_USD_PER_CHAR = 0.000167;     // Starter plan equivalent
const TURBO_USD_PER_CHAR = 0.000110;            // Turbo cheaper
const FLASH_USD_PER_CHAR = 0.000050;            // Flash cheapest

function priceFor(modelId: string, charCount: number): number {
  if (modelId.includes("flash")) return charCount * FLASH_USD_PER_CHAR;
  if (modelId.includes("turbo")) return charCount * TURBO_USD_PER_CHAR;
  return charCount * MULTILINGUAL_USD_PER_CHAR;
}

export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<SynthesizeSpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("[ElevenLabs] ELEVENLABS_API_KEY not set");
  }

  if (!input.text || input.text.trim().length === 0) {
    throw new Error("[ElevenLabs] Empty text");
  }

  // Résolution voix : priorité explicite (voiceId) > voiceProfile > tone > default
  const profile = input.voiceProfile ?? resolveVoiceProfile(input.personaTone);
  const voiceId = input.voiceId ?? profile.voiceId;
  const modelId = input.modelId ?? ELEVEN_DEFAULT_MODEL_ID;
  const charCount = input.text.length;

  // Voice settings : params explicites > profile > defaults sécurisés
  const stability = input.stability ?? profile.stability;
  const similarityBoost = input.similarityBoost ?? profile.similarityBoost;
  const style = input.style ?? profile.style;
  const useSpeakerBoost = input.useSpeakerBoost ?? profile.useSpeakerBoost ?? true;

  const res = await fetch(`${ELEVEN_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: useSpeakerBoost,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`[ElevenLabs] TTS failed ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    audio: buffer,
    charCount,
    costUsd: priceFor(modelId, charCount),
    modelUsed: modelId,
    voiceUsed: voiceId,
  };
}

/**
 * Estimate cost without performing the API call. Used by `requireCredits()`
 * pré-job pour réserver le bon montant.
 */
export function estimateSpeechCost(text: string, modelId = ELEVEN_DEFAULT_MODEL_ID): number {
  return priceFor(modelId, text.length);
}

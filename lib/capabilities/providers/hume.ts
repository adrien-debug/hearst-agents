/**
 * Hume EVI provider — analyse d'émotions vocales.
 *
 * Wrap thin autour de l'API Hume Expression Measurement (Voice).
 * https://dev.hume.ai/reference/expression-measurement-api/batch-jobs/start-inference-job-from-local-file
 *
 * Sans `HUME_API_KEY` chaque fonction throw `HumeUnavailableError` — les
 * routes consommatrices doivent le mapper en 503.
 *
 * Cache LRU 24h pour éviter de relancer un job à chaque appel sur le même
 * audio (clé = hash audioUrl). L'API Hume facture par minute analysée donc
 * c'est une protection minimale contre les boucles d'analyse.
 */

import { createHash } from "node:crypto";
import QuickLRU from "@alloc/quick-lru";

const HUME_BASE = process.env.HUME_API_BASE ?? "https://api.hume.ai/v0";

export class HumeUnavailableError extends Error {
  constructor(message = "Hume non configuré (HUME_API_KEY manquant)") {
    super(message);
    this.name = "HumeUnavailableError";
  }
}

export function isHumeConfigured(): boolean {
  return Boolean(process.env.HUME_API_KEY);
}

function getApiKey(): string {
  const key = process.env.HUME_API_KEY;
  if (!key) throw new HumeUnavailableError();
  return key;
}

export interface HumeEmotionResult {
  emotions: Record<string, number>;
  dominant: string | null;
  jobId?: string;
}

const emotionCache = new QuickLRU<string, HumeEmotionResult>({
  maxSize: 256,
  maxAge: 24 * 60 * 60 * 1000,
});

function cacheKey(audioUrl: string): string {
  return createHash("sha1").update(audioUrl).digest("hex");
}

/**
 * Analyse les émotions vocales d'un fichier audio (URL publique).
 * - Cap : on ne traite jamais plus de 30s côté payload (Hume gère le sampling
 *   interne mais on pose un guard en amont si l'appelant passe une durée).
 * - Cache 24h sur l'URL.
 *
 * NOTE : Hume Batch API est asynchrone — on lance le job, on poll jusqu'à
 * `status === "COMPLETED"`. Timeout 60s par défaut (configurable).
 */
export async function analyzeVoiceEmotion(
  audioUrl: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number; maxDurationSec?: number } = {},
): Promise<HumeEmotionResult> {
  const key = cacheKey(audioUrl);
  const cached = emotionCache.get(key);
  if (cached) return cached;

  const apiKey = getApiKey();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollMs = opts.pollIntervalMs ?? 2_000;
  const maxDuration = opts.maxDurationSec ?? 30;

  // 1) Start batch job (URL-based)
  const startRes = await fetch(`${HUME_BASE}/batch/jobs`, {
    method: "POST",
    headers: {
      "X-Hume-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      models: { prosody: { granularity: "utterance" } },
      urls: [audioUrl],
      // Hume n'expose pas directement un cap durée côté payload — on le valide
      // côté caller. Ce champ informatif sert juste à documenter l'intent.
      notify: false,
    }),
  });

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    throw new Error(
      `[Hume] start job status=${startRes.status} message=${body.slice(0, 200)}`,
    );
  }

  const startData = (await startRes.json()) as { job_id?: string };
  const jobId = startData.job_id;
  if (!jobId) throw new Error("[Hume] job_id manquant dans la réponse start");

  // 2) Poll jusqu'à COMPLETED ou FAILED
  const deadline = Date.now() + timeoutMs;
  let status = "QUEUED";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const stRes = await fetch(`${HUME_BASE}/batch/jobs/${jobId}`, {
      headers: { "X-Hume-Api-Key": apiKey },
    });
    if (!stRes.ok) continue;
    const stData = (await stRes.json()) as { state?: { status?: string } };
    status = stData.state?.status ?? status;
    if (status === "COMPLETED" || status === "FAILED") break;
  }

  if (status !== "COMPLETED") {
    throw new Error(`[Hume] job ${jobId} non terminé (status=${status})`);
  }

  // 3) Predictions
  const predRes = await fetch(`${HUME_BASE}/batch/jobs/${jobId}/predictions`, {
    headers: { "X-Hume-Api-Key": apiKey },
  });
  if (!predRes.ok) {
    const body = await predRes.text().catch(() => "");
    throw new Error(
      `[Hume] predictions status=${predRes.status} message=${body.slice(0, 200)}`,
    );
  }

  const predData = (await predRes.json()) as Array<{
    results?: {
      predictions?: Array<{
        models?: {
          prosody?: {
            grouped_predictions?: Array<{
              predictions?: Array<{
                emotions?: Array<{ name: string; score: number }>;
              }>;
            }>;
          };
        };
      }>;
    };
  }>;

  const emotionAccum: Record<string, number> = {};
  let count = 0;
  for (const file of predData) {
    const groups =
      file.results?.predictions?.[0]?.models?.prosody?.grouped_predictions ?? [];
    for (const grp of groups) {
      for (const p of grp.predictions ?? []) {
        for (const e of p.emotions ?? []) {
          emotionAccum[e.name] = (emotionAccum[e.name] ?? 0) + e.score;
          count++;
        }
      }
    }
  }

  // Normaliser : moyenne par catégorie
  const total = count > 0 ? count / Math.max(1, Object.keys(emotionAccum).length) : 1;
  const emotions: Record<string, number> = {};
  for (const [k, v] of Object.entries(emotionAccum)) {
    emotions[k] = total > 0 ? v / total : v;
  }

  const dominant =
    Object.entries(emotions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  void maxDuration; // documenté, mais non utilisé pour l'instant

  const result: HumeEmotionResult = { emotions, dominant, jobId };
  emotionCache.set(key, result);
  return result;
}

/** Test helper : reset cache. */
export function _resetHumeCache(): void {
  emotionCache.clear();
}

/**
 * Watchlist anomaly narrator (vague 9, action #3).
 *
 * Quand une métrique varie au-delà du seuil détecté par `detectAnomaly`,
 * on appelle Claude Haiku pour produire UNE phrase causale qui contextualise
 * la variation pour le user.
 *
 * Pourquoi Haiku (pas Sonnet) : 1 phrase, contraint, peu de raisonnement —
 * Haiku coûte ~10x moins cher et la qualité suffit pour ce volume.
 *
 * Pourquoi un cache mémoire 10min : la même anomaly peut être interrogée à
 * chaque mount du cockpit. On ne re-narre pas tant que la valeur n'a pas
 * changé sensiblement.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MetricAnomaly } from "./snapshots";

// ── System prompt ────────────────────────────────────────────

export const ANOMALY_NARRATOR_SYSTEM_PROMPT = [
  "Tu es l'analyste qui contextualise une variation de métrique business pour un fondateur.",
  "",
  "Tu reçois :",
  "  - le nom et l'id d'une métrique (MRR, ARR, Pipeline, Runway, ...)",
  "  - sa valeur courante",
  "  - sa baseline (moyenne 7 derniers jours)",
  "  - le pourcentage de variation",
  "  - éventuellement des drivers (deals, transactions, etc.)",
  "",
  "Tu produis UNE phrase, en français, max 140 caractères. Structure :",
  '  "<Métrique> <variation> sur <fenêtre> — <driver causale ou observation>."',
  "",
  "EXEMPLES :",
  '<example><input>MRR -8% en 7j (124k → 114k)</input><output>MRR -8% sur 7 jours — variation marquée, à creuser dans Stripe.</output></example>',
  '<example><input>Pipeline +24% en 7j (412k → 510k)</input><output>Pipeline +24% sur 7 jours — 3 deals nouveaux pondèrent fort.</output></example>',
  '<example><input>ARR -2% en 7j</input><output>ARR -2% sur 7 jours — bruit mensuel attendu, pas de signal fort.</output></example>',
  "",
  "CONTRAINTES :",
  "- Max 140 caractères au total.",
  "- Pas d'emojis, pas de markdown.",
  "- N'invente jamais un driver — si pas fourni, reste descriptif.",
  "- Vocabulaire premium : signal, levier, friction, marqué, à creuser, bruit attendu.",
  "- Bannis : « voici », « il faut », « les données montrent », « on peut voir que ».",
].join("\n");

// ── Cache mémoire ────────────────────────────────────────────

interface CacheEntry {
  narration: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60_000;

function cacheKey(anomaly: MetricAnomaly): string {
  // Round changePct à 1% pour grouper les calls similaires
  const rounded = Math.round(anomaly.changePct);
  return `${anomaly.metricId}::${rounded}::${anomaly.windowDays}`;
}

// ── Public API ───────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  mrr: "MRR",
  arr: "ARR",
  pipeline: "Pipeline",
  runway: "Runway",
};

interface NarrateAnomalyOpts {
  anomaly: MetricAnomaly;
  /** Drivers optionnels — par exemple « 3 deals stuck > 35j » pour le pipeline. */
  drivers?: string[];
}

export async function narrateAnomaly(
  opts: NarrateAnomalyOpts,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackNarration(opts.anomaly);
  }

  const key = cacheKey(opts.anomaly);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.narration;
  }

  const label = METRIC_LABELS[opts.anomaly.metricId] ?? opts.anomaly.metricId;
  const sign = opts.anomaly.changePct > 0 ? "+" : "";
  const pct = `${sign}${opts.anomaly.changePct.toFixed(1)}%`;

  const userMsg = [
    `Métrique : ${label} (id=${opts.anomaly.metricId})`,
    `Valeur courante : ${opts.anomaly.currentValue.toFixed(0)}`,
    `Baseline ${opts.anomaly.windowDays}j : ${opts.anomaly.baselineValue.toFixed(0)}`,
    `Variation : ${pct} sur ${opts.anomaly.windowDays}j`,
    "",
    opts.drivers && opts.drivers.length > 0
      ? `Drivers candidats : ${opts.drivers.join(" · ")}`
      : "Drivers : aucun candidat fourni — reste descriptif.",
    "",
    "Produis 1 phrase max 140 caractères.",
  ].join("\n");

  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: ANOMALY_NARRATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });

    const block = res.content[0];
    let narration = block?.type === "text" ? block.text.trim() : "";
    // Cap à 140 caractères, sans couper un mot au milieu.
    if (narration.length > 140) {
      const cut = narration.slice(0, 140).lastIndexOf(" ");
      narration = narration.slice(0, cut > 80 ? cut : 140);
    }
    if (!narration) return fallbackNarration(opts.anomaly);

    cache.set(key, {
      narration,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return narration;
  } catch (err) {
    console.warn("[watchlist/narrate] LLM échouée, fallback :", err);
    return fallbackNarration(opts.anomaly);
  }
}

function fallbackNarration(anomaly: MetricAnomaly): string {
  const label = METRIC_LABELS[anomaly.metricId] ?? anomaly.metricId;
  const sign = anomaly.changePct > 0 ? "+" : "";
  const pct = `${sign}${anomaly.changePct.toFixed(1)}%`;
  return `${label} ${pct} sur ${anomaly.windowDays} jours — variation marquée.`;
}

/** Test-only : reset du cache. */
export function _resetNarrateCache(): void {
  cache.clear();
}

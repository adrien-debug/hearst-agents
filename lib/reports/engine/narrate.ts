/**
 * Narration LLM — single-shot, prompt-cached.
 *
 * Reçoit STRICTEMENT les scalaires + top-N rows du payload (jamais le raw)
 * pour rester sous le budget de tokens. Le prompt système est cacheable.
 *
 * Coût cible : ~600 output tokens (Sonnet 4-6) + ~3-5k input cached → <$0.05.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { ReportSpec, NarrationSpec } from "@/lib/reports/spec/schema";
import type { RenderPayload } from "./render-blocks";
import { NARRATION_FEWSHOT_FR, formatFewShotBlock } from "@/lib/prompts/examples";
import { composeEditorialPrompt } from "@/lib/editorial/charter";

const NARRATE_MODEL = "claude-sonnet-4-6";

const STYLE_PROMPTS = {
  executive:
    "Style cadre exécutif : factuel, orienté décision, signal-to-noise élevé. " +
    "Pas d'adjectifs marketing. Cite les chiffres avec leur delta.",
  operational:
    "Style opérationnel : détaillé, actionnable, oriente vers les next steps. " +
    "Inclus 1-2 actions concrètes en fin de bullets.",
  candid:
    "Style candide et direct : nomme les risques sans détour, dit ce qui ne va pas. " +
    "Pas de langue de bois, mais reste factuel.",
} as const;

const MODE_PROMPTS = {
  bullets:
    "Format : 4-6 bullets en français, chaque bullet 1-2 phrases courtes. Aucun titre, aucune introduction.",
  "intro+bullets":
    "Format : 1 phrase d'introduction (1 ligne max) puis 4-6 bullets en français. Pas d'autre texte.",
  editorial: [
    "Format ÉDITORIAL premium (style fondateur exigeant) :",
    "1. **Lead** : 1 phrase punchline mature qui nomme le signal central. Pas « Voici un résumé », pas « Le report montre ».",
    "2. **Key findings** : 3 bullets cinglants, chacun nomme un fait + sa conséquence.",
    "3. **Risks** : 2 bullets identifiés, chacun nomme la tension réelle.",
    "4. **Recommendation** : 1 phrase actionnable au futur ou à l'impératif (« Recentre l'effort commercial sur… »).",
  ].join("\n"),
} as const;

export interface NarrateInput {
  spec: ReportSpec;
  payload: RenderPayload;
}

export interface NarrateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
}

/**
 * Génère la narration. Si pas de narrationSpec, retourne null.
 *
 * **Important**: l'entrée envoyée au LLM est **uniquement** scalars +
 * top-N rows par block. Le raw n'est JAMAIS inclus.
 */
export async function narrate(input: NarrateInput): Promise<NarrateResult | null> {
  const narrationSpec = input.spec.narration;
  if (!narrationSpec) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "[narration indisponible — ANTHROPIC_API_KEY manquant]",
      inputTokens: 0,
      outputTokens: 0,
      cached: false,
    };
  }

  const anthropic = createAnthropic({ apiKey });

  const systemPrompt = buildSystemPrompt(input.spec.meta.persona, narrationSpec);
  const userPrompt = buildUserPrompt(input.spec, input.payload);

  const result = await generateText({
    model: anthropic(NARRATE_MODEL),
    system: {
      role: "system" as const,
      content: systemPrompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    messages: [{ role: "user" as const, content: userPrompt }],
    maxOutputTokens: narrationSpec.maxTokens,
    temperature: 0.4,
  });

  return {
    text: result.text.trim(),
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cached: false, // l'API ne retourne pas le cache hit ratio directement ici
  };
}

// ── Prompt builders ─────────────────────────────────────────

function buildSystemPrompt(persona: string, narrationSpec: NarrationSpec): string {
  const lines = [
    "Tu es l'analyste interne d'un OS business chat-first. Tu lis les agrégats",
    "d'un report et tu écris une narration courte en français.",
    "",
    `Tu écris pour : ${persona}.`,
    `Style : ${STYLE_PROMPTS[narrationSpec.style]}`,
    `${MODE_PROMPTS[narrationSpec.mode]}`,
    "",
    "RÈGLES SPÉCIFIQUES :",
    "- Ne JAMAIS inventer un chiffre. Utilise uniquement les valeurs du payload.",
    "- Si une valeur est null, dis 'donnée indisponible' au lieu de l'inventer.",
  ];

  if (narrationSpec.mode === "editorial") {
    lines.push("", "EXEMPLES (mode éditorial) :", formatFewShotBlock(NARRATION_FEWSHOT_FR));
  }

  return composeEditorialPrompt(lines.join("\n"));
}

function buildUserPrompt(spec: ReportSpec, payload: RenderPayload): string {
  const { meta } = spec;

  // Extrait des top-3 rows par block non-kpi pour donner du contexte sans
  // exploser le prompt.
  const blockSummaries = payload.blocks.map((b) => {
    if (b.type === "kpi") {
      const d = b.data as { value: unknown; delta: unknown };
      return `[${b.id}] kpi "${b.label ?? b.id}" — value=${fmt(d.value)} delta=${fmt(d.delta)}`;
    }
    const rows = (b.data as ReadonlyArray<Record<string, unknown>>).slice(0, 3);
    return `[${b.id}] ${b.type} "${b.label ?? b.id}" — top ${rows.length}/${(b.data as ReadonlyArray<unknown>).length}: ${JSON.stringify(rows)}`;
  });

  const scalarLines = Object.entries(payload.scalars).map(
    ([k, v]) => `  ${k} = ${fmt(v)}`,
  );

  return [
    `Report: ${meta.title}`,
    `Domaine: ${meta.domain} · Persona: ${meta.persona} · Cadence: ${meta.cadence}`,
    "",
    "Scalaires :",
    ...scalarLines,
    "",
    "Blocks :",
    ...blockSummaries,
    "",
    "Écris la narration maintenant.",
  ].join("\n");
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "null";
    return Math.abs(v) >= 1000 ? v.toLocaleString("fr-FR") : String(v);
  }
  return JSON.stringify(v);
}

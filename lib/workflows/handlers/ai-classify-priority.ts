/**
 * Handler `ai_classify_priority` — classification rapide d'une service request
 * en priorité {urgent | normal | low} via Claude Haiku.
 *
 * Args :
 *  - text: string
 *  - type?: string
 *  - categories?: string[]  (default ["urgent", "normal", "low"])
 *  - model?: string  (default "claude-haiku-4-5-20251001")
 *
 * Sortie :
 *  { priority: "urgent" | "normal" | "low", reasoning?: string }
 *
 * Sans clé Anthropic → priority = "normal" + degraded.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { WorkflowHandler } from "./types";

const DEFAULT_CATEGORIES = ["urgent", "normal", "low"] as const;
type Priority = (typeof DEFAULT_CATEGORIES)[number];

// NOTE charte : prompt de CLASSIFICATION structurée (JSON priority +
// reasoning ≤ 20 mots), pas un prompt éditorial. La charte
// (composeEditorialPrompt) n'est pas chargée — la sortie est consommée
// par le routeur de tickets, pas par l'utilisateur final.
const SYSTEM = [
  "Tu es un dispatcher hôtelier qui classe une service request guest selon son urgence.",
  "",
  "FORMAT STRICT — JSON uniquement :",
  '{ "priority": "urgent" | "normal" | "low", "reasoning": string }',
  "",
  "RÈGLES :",
  "- urgent : safety, médical, fuite, panne bloquante (clé, ascenseur, climatisation), VIP fâché.",
  "- normal : demande standard (towels, room service, conciergerie planning).",
  "- low : info, suggestion, question non-bloquante.",
  "- reasoning ≤ 20 mots.",
].join("\n");

function isPriority(s: string): s is Priority {
  return DEFAULT_CATEGORIES.includes(s as Priority);
}

export const aiClassifyPriority: WorkflowHandler = async (args) => {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  const type = typeof args.type === "string" ? args.type : null;

  if (!text) {
    return { success: true, output: { priority: "normal" as Priority, degraded: true, reason: "empty_text" } };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      success: true,
      output: { priority: "normal" as Priority, degraded: true, reason: "no_anthropic_key" },
    };
  }

  const model = typeof args.model === "string" ? args.model : "claude-haiku-4-5-20251001";

  try {
    const client = new Anthropic();
    const userPrompt = [
      `Type : ${type ?? "(non précisé)"}`,
      "",
      `Texte de la request :`,
      text,
    ].join("\n");

    const msg = await client.messages.create({
      model,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });

    const out = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        success: true,
        output: { priority: "normal" as Priority, degraded: true, reason: "no_json" },
      };
    }
    const parsed = JSON.parse(m[0]) as { priority?: string; reasoning?: string };
    const p = isPriority(String(parsed.priority ?? "")) ? (parsed.priority as Priority) : "normal";
    return {
      success: true,
      output: { priority: p, reasoning: parsed.reasoning ?? "" },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      success: true,
      output: { priority: "normal" as Priority, degraded: true, reason },
    };
  }
};

/**
 * Handler `ai_draft_welcome_notes` — génère via Claude Haiku une note de
 * bienvenue personnalisée par guest VIP.
 *
 * Args attendus :
 *  - arrivals: Array<{ guestName, room, specialRequest? }>
 *  - tone?: "warm-professional" | "casual" | "formal"
 *  - includeRoomNumber?: boolean
 *
 * Sortie :
 *  { notes: Array<{ guestName, room, note }> }
 *
 * Sans `ANTHROPIC_API_KEY`, on retourne `success: true` avec une note
 * fallback minimaliste — le workflow continue mais l'asset final sera
 * clairement marqué `degraded: true`.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { WorkflowHandler } from "./types";
import { composeEditorialPrompt } from "@/lib/editorial/charter";

interface ArrivalLite {
  guestName: string;
  room?: string;
  specialRequest?: string | null;
  vip?: boolean;
}

/**
 * Voix dérivée "Hospitality" : la charte Hearst s'applique (zéro emoji,
 * vocab sobre, pas de superlatifs creux), avec une dérogation explicite
 * sur le tutoiement → vouvoiement requis pour le contexte concierge VIP.
 */
const SYSTEM_PROMPT = composeEditorialPrompt([
  "Tu es un concierge premium qui rédige des welcome notes courtes et personnalisées pour des guests VIP.",
  "",
  "FORMAT STRICT — JSON ARRAY uniquement, sans markdown fence, sans préambule :",
  '[{ "guestName": string, "room": string, "note": string }]',
  "",
  "RÈGLES SPÉCIFIQUES :",
  "- Chaque note ≤ 80 mots (cap dur).",
  "- Ton chaleureux, jamais obséquieux. Pas de superlatifs creux.",
  "- Si specialRequest est présent, le mentionner discrètement (« nous avons préparé… »).",
  "- DÉROGATION CHARTE : vouvoiement obligatoire ici (contexte hospitality VIP). Le tutoiement par défaut de Hearst ne s'applique pas.",
  "- Pas de phrase générique copiée-collée d'un guest à l'autre.",
].join("\n"));

function fallbackNote(a: ArrivalLite): string {
  return `Bienvenue ${a.guestName}. Votre chambre ${a.room ?? ""} est prête. La conciergerie reste à votre disposition.`.trim();
}

export const aiDraftWelcomeNotes: WorkflowHandler = async (args) => {
  const arrivalsRaw = Array.isArray(args.arrivals) ? args.arrivals : [];
  const arrivals: ArrivalLite[] = arrivalsRaw
    .map((a) => (typeof a === "object" && a ? (a as ArrivalLite) : null))
    .filter((a): a is ArrivalLite => a !== null && typeof a.guestName === "string");

  if (arrivals.length === 0) {
    return { success: true, output: { notes: [], degraded: false } };
  }

  const tone = typeof args.tone === "string" ? args.tone : "warm-professional";
  const includeRoom = args.includeRoomNumber !== false;

  if (!process.env.ANTHROPIC_API_KEY) {
    const notes = arrivals.map((a) => ({
      guestName: a.guestName,
      room: a.room ?? "",
      note: fallbackNote(a),
    }));
    return { success: true, output: { notes, degraded: true, reason: "no_anthropic_key" } };
  }

  try {
    const client = new Anthropic();
    const userPrompt = [
      `Tone : ${tone}.`,
      includeRoom ? "Inclus le numéro de chambre dans la note." : "Pas de numéro de chambre.",
      "",
      "Arrivals (JSON) :",
      JSON.stringify(arrivals, null, 2),
    ].join("\n");

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) {
      const notes = arrivals.map((a) => ({
        guestName: a.guestName,
        room: a.room ?? "",
        note: fallbackNote(a),
      }));
      return { success: true, output: { notes, degraded: true, reason: "no_json_in_response" } };
    }

    const parsed = JSON.parse(m[0]) as Array<{
      guestName: string;
      room?: string;
      note: string;
    }>;

    const notes = parsed.map((n) => ({
      guestName: String(n.guestName ?? ""),
      room: String(n.room ?? ""),
      note: String(n.note ?? ""),
    }));

    return { success: true, output: { notes, degraded: false } };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const notes = arrivals.map((a) => ({
      guestName: a.guestName,
      room: a.room ?? "",
      note: fallbackNote(a),
    }));
    return { success: true, output: { notes, degraded: true, reason } };
  }
};

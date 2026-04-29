/**
 * Composio → Voice Bridge.
 *
 * Récupère les tools Composio ACTIVE pour un user et les filtre pour la
 * voix : on ne peut pas dumper 100+ tools dans le system prompt voix
 * (latence, coût, hallucinations). On garde un sous-ensemble pertinent
 * conversationnel : top 4 par toolkit, cap 20 total.
 *
 * Différence vs `toAiTools` (chemin chat orchestrator) :
 *  - Pas de `_preview` gate. La confirmation pour actions destructives
 *    est gérée par le system prompt voix (le modèle Realtime demande à
 *    l'utilisateur "confirmer ?" avant d'invoquer un tool destructif).
 *    Un gate technique forcerait deux tool-calls et casserait l'UX vocale.
 *  - Format de retour : `VoiceToolDef` (plat, OpenAI Realtime) et non
 *    Vercel AI SDK Tool object.
 *
 * L'exécution réelle est faite par `executeVoiceTool` dans `./tools.ts`,
 * qui dispatch vers `executeComposioAction` pour tout name non-Hearst.
 */

import { getToolsForUser, type DiscoveredTool } from "@/lib/connectors/composio/discovery";
import type { VoiceToolDef } from "./tool-defs";

const MAX_TOOLS_TOTAL = 20;
const MAX_TOOLS_PER_APP = 4;

/**
 * Sélectionne au plus `MAX_TOOLS_PER_APP` tools par toolkit, dans l'ordre
 * retourné par Composio (le SDK trie par popularité/usage), puis tronque à
 * `MAX_TOOLS_TOTAL`. Garde l'ordre déterministe pour qu'un même user voie
 * la même liste à chaque mint.
 */
function curateForVoice(tools: DiscoveredTool[]): DiscoveredTool[] {
  const perApp = new Map<string, number>();
  const kept: DiscoveredTool[] = [];

  for (const t of tools) {
    if (kept.length >= MAX_TOOLS_TOTAL) break;
    const count = perApp.get(t.app) ?? 0;
    if (count >= MAX_TOOLS_PER_APP) continue;
    perApp.set(t.app, count + 1);
    kept.push(t);
  }

  return kept;
}

function toVoiceToolDef(tool: DiscoveredTool): VoiceToolDef {
  // Composio retourne souvent un schéma pré-formé. On le garde tel quel —
  // OpenAI Realtime accepte le même format JSON Schema. Si le tool n'a
  // pas de `parameters`, on dégrade vers un objet vide.
  const params =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as VoiceToolDef["parameters"])
      : { type: "object" as const, properties: {} };

  return {
    type: "function",
    name: tool.name,
    description: tool.description || tool.name,
    parameters: params,
  };
}

/**
 * Récupère les tools voix Composio pour un user. Retourne un array vide
 * si Composio n'est pas configuré, si l'user n'a aucune app connectée,
 * ou en cas d'erreur — la voix continue de fonctionner avec les seuls
 * hearst-actions.
 */
export async function getVoiceComposioTools(userId: string): Promise<VoiceToolDef[]> {
  if (!userId) return [];
  try {
    const discovered = await getToolsForUser(userId);
    if (discovered.length === 0) return [];
    const curated = curateForVoice(discovered);
    return curated.map(toVoiceToolDef);
  } catch (err) {
    console.error("[voice/composio-bridge] discovery failed:", err);
    return [];
  }
}

/**
 * Liste statique des préfixes Composio détectables pour aiguiller le
 * dispatcher (`executeVoiceTool`). Tout name qui matche `<APP>_<ACTION>`
 * en uppercase et qui n'est pas un Hearst tool est traité comme Composio.
 */
export function isComposioToolName(name: string): boolean {
  // Composio convention : SLUG en majuscules avec underscores. Les hearst
  // tools sont en lowercase (`start_meeting_bot`, etc.) — pas d'overlap.
  return /^[A-Z][A-Z0-9_]+$/.test(name);
}

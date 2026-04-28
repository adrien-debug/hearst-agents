/**
 * Adapter Composio — exécute une action via le SDK et extrait un Tabular.
 *
 * Contraintes :
 *  - Ne JAMAIS appeler une action write (le moteur reports ne fait que lire).
 *  - Échec gracieux : si l'action retourne ok=false, on retourne [] et on
 *    laisse le pipeline continuer (la narration LLM dira la vérité au user).
 *
 * Réutilise :
 *  - executeComposioAction ([lib/connectors/composio/client.ts])
 *  - isWriteAction ([lib/connectors/composio/write-guard.ts])
 */

import { executeComposioAction } from "@/lib/connectors/composio/client";
import { isWriteAction } from "@/lib/connectors/composio/write-guard";
import type { Tabular } from "@/lib/reports/engine/tabular";
import { extractTabular } from "./extract";

export interface FetchComposioInput {
  action: string;
  params: Record<string, unknown>;
  userId: string;
}

export interface FetchComposioResult {
  rows: Tabular;
  ok: boolean;
  error?: string;
  errorCode?: string;
}

export async function fetchComposio(
  input: FetchComposioInput,
): Promise<FetchComposioResult> {
  if (isWriteAction(input.action)) {
    return {
      rows: [],
      ok: false,
      error: `Action '${input.action}' est en write — interdit pour les reports`,
      errorCode: "WRITE_FORBIDDEN",
    };
  }

  const result = await executeComposioAction({
    action: input.action,
    entityId: input.userId,
    params: input.params,
  });

  if (!result.ok) {
    return {
      rows: [],
      ok: false,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  return { rows: extractTabular(result.data), ok: true };
}

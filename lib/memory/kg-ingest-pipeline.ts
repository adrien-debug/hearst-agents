/**
 * KG ingest pipeline — extraction non-bloquante d'entités depuis un échange
 * (user message + assistant reply) après que le run orchestrate soit
 * terminé. Fire-and-forget côté serveur : aucune erreur ne remonte vers
 * l'orchestrator, le run reste résolu indépendamment.
 *
 * Pattern :
 *   ingestConversationTurn({ userId, tenantId, userMessage, assistantReply })
 *     → extractEntities(text) [Claude haiku, ~1s]
 *     → upsertNode/upsertEdge en série
 *     → log + cache invalidation pour kg-context
 */

import { extractEntities, upsertNode, upsertEdge } from "./kg";
import { __clearKgContextCache } from "./kg-context";
import { upsertEmbedding } from "@/lib/embeddings/store";

/**
 * Construit un texte excerpt pour embedding d'un node KG.
 * Format : "<type>: <label> — <key1>: <val1>; <key2>: <val2>"
 * (cap implicite à 4000 chars côté upsertEmbedding).
 */
function buildNodeExcerpt(entity: {
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}): string {
  const props = entity.properties ?? {};
  const propsString = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .slice(0, 8)
    .join("; ");
  return propsString
    ? `${entity.type}: ${entity.label} — ${propsString}`
    : `${entity.type}: ${entity.label}`;
}

export interface IngestTurnInput {
  userId: string;
  tenantId: string;
  userMessage: string;
  assistantReply: string;
}

export interface IngestTurnResult {
  entitiesCreated: number;
  edgesCreated: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Concatène user + assistant en un texte mergé pour l'extraction. Limite
 * stricte à ~6000 chars pour rester sous le budget Claude haiku rapide.
 */
function buildExtractionInput(userMessage: string, assistantReply: string): string {
  const u = userMessage.trim().slice(0, 3000);
  const a = assistantReply.trim().slice(0, 3000);
  if (!u && !a) return "";
  return [
    u ? `USER: ${u}` : "",
    a ? `ASSISTANT: ${a}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Extrait + persiste KG depuis un turn de conversation. Idempotent grâce
 * à upsertNode (ON CONFLICT user_id+tenant_id+type+label) et upsertEdge
 * (qui incrémente le weight si l'arête existe).
 */
export async function ingestConversationTurn(
  input: IngestTurnInput,
): Promise<IngestTurnResult> {
  const text = buildExtractionInput(input.userMessage, input.assistantReply);
  if (!text) {
    return { entitiesCreated: 0, edgesCreated: 0, skipped: true, reason: "empty_text" };
  }

  let extraction;
  try {
    extraction = await extractEntities(text);
  } catch (err) {
    console.warn("[kg-ingest-pipeline] extraction failed:", err);
    return { entitiesCreated: 0, edgesCreated: 0, skipped: true, reason: "extraction_failed" };
  }

  if (extraction.entities.length === 0 && extraction.relations.length === 0) {
    return { entitiesCreated: 0, edgesCreated: 0, skipped: true, reason: "nothing_to_extract" };
  }

  const scope = { userId: input.userId, tenantId: input.tenantId };
  const idByLabel = new Map<string, string>();
  let entitiesCreated = 0;

  for (const entity of extraction.entities) {
    try {
      const id = await upsertNode(scope, {
        type: entity.type,
        label: entity.label,
        properties: entity.properties ?? {},
      });
      idByLabel.set(entity.label, id);
      entitiesCreated += 1;

      // Auto-embed le node pour permettre query_knowledge_graph (semantic search).
      // Fire-and-forget : si OPENAI_API_KEY manque ou Supabase down, fail-soft
      // (la fonction interne log warn et retourne false).
      void upsertEmbedding({
        userId: scope.userId,
        tenantId: scope.tenantId,
        sourceKind: "kg_node",
        sourceId: id,
        textExcerpt: buildNodeExcerpt(entity),
        metadata: { type: entity.type, label: entity.label },
      });
    } catch (err) {
      console.warn(
        `[kg-ingest-pipeline] upsertNode failed for "${entity.label}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let edgesCreated = 0;
  for (const relation of extraction.relations) {
    const sourceId = idByLabel.get(relation.source_label);
    const targetId = idByLabel.get(relation.target_label);
    if (!sourceId || !targetId) continue;
    try {
      await upsertEdge(scope, {
        source_id: sourceId,
        target_id: targetId,
        type: relation.type,
        weight: relation.weight,
      });
      edgesCreated += 1;
    } catch (err) {
      console.warn(
        `[kg-ingest-pipeline] upsertEdge failed (${relation.source_label} → ${relation.target_label}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Invalide le cache de getKgContextForUser pour que le prochain prompt
  // reflète immédiatement les nouvelles entités.
  __clearKgContextCache();

  return { entitiesCreated, edgesCreated, skipped: false };
}

/**
 * Wrapper fire-and-forget — s'attache à un Promise orphelin. Aucune erreur
 * ne remonte. À utiliser depuis ai-pipeline.ts en post-stream pour ne PAS
 * bloquer la réponse SSE.
 */
export function fireAndForgetIngestTurn(input: IngestTurnInput): void {
  void ingestConversationTurn(input).catch((err) => {
    console.warn("[kg-ingest-pipeline] background ingest failed:", err);
  });
}

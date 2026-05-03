/**
 * Helper partagé pour construire un text excerpt à partir d'un kg_node.
 * Utilisé par :
 *  - lib/memory/kg-ingest-pipeline.ts (auto-embed à l'ingest)
 *  - scripts/backfill-kg-embeddings.ts (one-shot backfill nodes existants)
 *
 * Format : "<type>: <label> — <key1>: <val1>; <key2>: <val2>" (max ~4000
 * chars, le clamp explicite est délégué à upsertEmbedding).
 */

interface NodeLikeShape {
  type: string;
  label: string;
  properties?: Record<string, unknown> | null;
}

export function buildNodeExcerpt(node: NodeLikeShape): string {
  const props = node.properties ?? {};
  const propsString = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .slice(0, 8)
    .join("; ");
  return propsString
    ? `${node.type}: ${node.label} — ${propsString}`
    : `${node.type}: ${node.label}`;
}

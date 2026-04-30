/**
 * Knowledge Graph — Signature 7 MVP.
 *
 * Extraction d'entités via Claude haiku (rapide, < 2s) + persistence dans
 * `kg_nodes` / `kg_edges` (cf. migration 0035). Phase B suivante : Letta
 * self-hosted + Zep + pgvector pour mémoire long terme et raisonnement.
 *
 * Scope : par user_id + tenant_id, isolation RLS-ready (cf. policy
 * `kg_*_user_isolation`).
 */

import Anthropic from "@anthropic-ai/sdk";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import type { Database } from "@/lib/database.types";
import { KG_EXTRACTION_FEWSHOT, formatFewShotBlock } from "@/lib/prompts/examples";

type Json = Database["public"]["Tables"]["kg_nodes"]["Row"]["properties"];

export type KgNodeType = "person" | "company" | "project" | "decision" | "commitment" | "topic";

export interface KgNode {
  id: string;
  user_id: string;
  tenant_id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KgEdge {
  id: string;
  user_id: string;
  tenant_id: string;
  source_id: string;
  target_id: string;
  type: string;
  weight: number;
  created_at: string;
}

export interface KgGraph {
  nodes: KgNode[];
  edges: KgEdge[];
}

export interface ExtractedEntity {
  type: KgNodeType;
  label: string;
  properties?: Record<string, unknown>;
}

export interface ExtractedRelation {
  source_label: string;
  target_label: string;
  type: string;
  weight?: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

interface KgScope {
  userId: string;
  tenantId: string;
}

const ENTITY_TYPES: ReadonlyArray<KgNodeType> = [
  "person",
  "company",
  "project",
  "decision",
  "commitment",
  "topic",
];

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
const EXTRACTION_MAX_TOKENS = 2048;

export const EXTRACTION_PROMPT = [
  "Tu es un extracteur de Knowledge Graph. Tu analyses le texte fourni et tu produis entités + relations en JSON strict.",
  "",
  "TYPES D'ENTITÉS AUTORISÉS (uniquement, jamais d'autre valeur) :",
  "- person : une personne nommée (prénom + nom si possible).",
  "- company : une entreprise, fonds, organisation.",
  "- project : un projet, produit, initiative, levée de fonds.",
  "- decision : une décision prise ou à prendre (verbe d'action + objet).",
  "- commitment : un engagement, deadline, promesse datée.",
  "- topic : un sujet, concept ou thème récurrent.",
  "",
  "TYPES DE RELATIONS COURANTS : works_at, mentioned, owns, depends_on, related_to, decides, blocks.",
  "",
  "RÈGLES D'EXTRACTION :",
  "- Ignore les pronoms (« il », « elle », « on ») — n'extrais que les entités nommées.",
  "- Normalise la casse des noms : « John Smith » pas « john smith » ni « JOHN SMITH ».",
  "- Si un rôle est mentionné (CFO, CEO, lead investor), mets-le dans `properties.role`.",
  "- Si une deadline ou un montant est mentionné, mets-le dans `properties` (deadline, amount, currency).",
  "- N'extrais pas deux fois la même entité.",
  "- Pour un texte trop court ou sans entité claire (< 10 mots, salutation), retourne {entities:[], relations:[]}.",
  "",
  "FORMAT STRICT — JSON uniquement, sans texte autour, sans markdown fence :",
  "{",
  '  "entities": [{ "type": "person|company|project|decision|commitment|topic", "label": "string", "properties": {} }],',
  '  "relations": [{ "source_label": "string", "target_label": "string", "type": "string", "weight": 1.0 }]',
  "}",
  "",
  "EXEMPLES :",
  formatFewShotBlock(KG_EXTRACTION_FEWSHOT),
].join("\n");

export async function extractEntities(text: string): Promise<ExtractionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { entities: [], relations: [] };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[kg] ANTHROPIC_API_KEY manquant — extraction skip");
    return { entities: [], relations: [] };
  }

  const anthropic = new Anthropic({ apiKey });

  let raw: string;
  try {
    const res = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: EXTRACTION_MAX_TOKENS,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });
    const block = res.content[0];
    raw = block?.type === "text" ? block.text : "";
  } catch (err) {
    console.warn("[kg] extraction échouée:", err);
    return { entities: [], relations: [] };
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { entities: [], relations: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { entities: [], relations: [] };
  }

  if (!parsed || typeof parsed !== "object") return { entities: [], relations: [] };
  const obj = parsed as { entities?: unknown; relations?: unknown };

  const entities: ExtractedEntity[] = [];
  if (Array.isArray(obj.entities)) {
    for (const item of obj.entities) {
      if (!item || typeof item !== "object") continue;
      const e = item as { type?: unknown; label?: unknown; properties?: unknown };
      if (typeof e.type !== "string" || typeof e.label !== "string") continue;
      const label = e.label.trim();
      if (!label) continue;
      const type = e.type as KgNodeType;
      if (!ENTITY_TYPES.includes(type)) continue;
      const properties = e.properties && typeof e.properties === "object"
        ? (e.properties as Record<string, unknown>)
        : {};
      entities.push({ type, label, properties });
    }
  }

  const relations: ExtractedRelation[] = [];
  if (Array.isArray(obj.relations)) {
    for (const item of obj.relations) {
      if (!item || typeof item !== "object") continue;
      const r = item as { source_label?: unknown; target_label?: unknown; type?: unknown; weight?: unknown };
      if (typeof r.source_label !== "string" || typeof r.target_label !== "string" || typeof r.type !== "string") continue;
      const source = r.source_label.trim();
      const target = r.target_label.trim();
      const relType = r.type.trim();
      if (!source || !target || !relType) continue;
      const weight = typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : 1.0;
      relations.push({ source_label: source, target_label: target, type: relType, weight });
    }
  }

  return { entities, relations };
}

export async function upsertNode(
  scope: KgScope,
  node: { type: string; label: string; properties?: Record<string, unknown> },
): Promise<string> {
  const sb = requireServerSupabase();
  const properties = node.properties ?? {};

  // ON CONFLICT DO UPDATE merge des properties (EXCLUDED || existing) +
  // bump updated_at — supabase-js ne supporte pas directement le merge
  // jsonb dans upsert, donc on passe par un RPC-like via raw SQL si dispo
  // ou un upsert simple suivi d'un select. Ici, MVP : upsert qui remplace
  // les properties (acceptable car on extrait de zéro à chaque ingest et
  // les propriétés sont enrichies via re-extraction).
  const { data, error } = await sb
    .from("kg_nodes")
    .upsert(
      {
        user_id: scope.userId,
        tenant_id: scope.tenantId,
        type: node.type,
        label: node.label,
        properties: properties as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tenant_id,type,label" },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[kg] upsertNode failed: ${error?.message ?? "no data"}`);
  }
  return data.id;
}

export async function upsertEdge(
  scope: KgScope,
  edge: { source_id: string; target_id: string; type: string; weight?: number },
): Promise<void> {
  const sb = requireServerSupabase();
  const incomingWeight = edge.weight ?? 1.0;

  // Lookup existant pour incrémenter le weight si conflict — on évite la
  // sémantique d'EXCLUDED || existing qui n'est pas exposée par
  // supabase-js. Pattern : SELECT puis UPDATE/INSERT.
  const { data: existing, error: selectError } = await sb
    .from("kg_edges")
    .select("id, weight")
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId)
    .eq("source_id", edge.source_id)
    .eq("target_id", edge.target_id)
    .eq("type", edge.type)
    .maybeSingle();

  if (selectError) {
    throw new Error(`[kg] upsertEdge select failed: ${selectError.message}`);
  }

  if (existing) {
    const { error: updateError } = await sb
      .from("kg_edges")
      .update({ weight: (existing.weight ?? 0) + incomingWeight })
      .eq("id", existing.id);
    if (updateError) {
      throw new Error(`[kg] upsertEdge update failed: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await sb.from("kg_edges").insert({
    user_id: scope.userId,
    tenant_id: scope.tenantId,
    source_id: edge.source_id,
    target_id: edge.target_id,
    type: edge.type,
    weight: incomingWeight,
  });
  if (insertError) {
    throw new Error(`[kg] upsertEdge insert failed: ${insertError.message}`);
  }
}

export async function getGraph(scope: KgScope): Promise<KgGraph> {
  const sb = requireServerSupabase();

  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] = await Promise.all([
    sb
      .from("kg_nodes")
      .select("*")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId),
    sb
      .from("kg_edges")
      .select("*")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId),
  ]);

  if (nodesError) throw new Error(`[kg] getGraph nodes failed: ${nodesError.message}`);
  if (edgesError) throw new Error(`[kg] getGraph edges failed: ${edgesError.message}`);

  return {
    nodes: (nodes ?? []) as KgNode[],
    edges: (edges ?? []) as KgEdge[],
  };
}

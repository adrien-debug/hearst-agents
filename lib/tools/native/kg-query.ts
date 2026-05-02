/**
 * Knowledge Graph query tool — semantic search + reasoning narratif.
 *
 * Pipeline :
 *   1. Embedder la question via OpenAI (text-embedding-3-small)
 *   2. Top-K nodes via pgvector (sourceKinds: ["kg_node"])
 *   3. Fetch nodes complets + edges connectés (limit 50, weight DESC)
 *   4. Si withNarrative : Sonnet résume en 2-3 phrases
 *
 * Scope strict : userId+tenantId. Cross-thread (le KG est global per user).
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import Anthropic from "@anthropic-ai/sdk";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { searchEmbeddings } from "@/lib/embeddings/store";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import type { KgNode, KgEdge } from "@/lib/memory/kg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiToolMap = Record<string, Tool<any, any>>;

interface QueryKgArgs {
  question: string;
  withNarrative?: boolean;
  limit?: number;
}

interface QueryKgResult {
  nodes: KgNode[];
  edges: KgEdge[];
  narrative: string | null;
}

const NARRATIVE_MODEL = "claude-sonnet-4-6";
const NARRATIVE_MAX_TOKENS = 400;

export async function runKgQuery(
  scope: { userId: string; tenantId: string },
  params: { question: string; withNarrative?: boolean; limit?: number },
): Promise<QueryKgResult> {
  const k = Math.min(params.limit ?? 8, 20);

  // 1. Top-K nodes via embeddings (sourceKind kg_node)
  const hits = await searchEmbeddings({
    userId: scope.userId,
    tenantId: scope.tenantId,
    queryText: params.question,
    k,
    sourceKinds: ["kg_node"],
  });

  if (hits.length === 0) {
    return { nodes: [], edges: [], narrative: null };
  }

  const nodeIds = hits.map((h) => h.sourceId);

  // 2. Fetch nodes complets + edges connectés
  const sb = requireServerSupabase();
  const [{ data: nodesData, error: nodesErr }, { data: outEdges }, { data: inEdges }] =
    await Promise.all([
      sb
        .from("kg_nodes")
        .select("*")
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .in("id", nodeIds),
      sb
        .from("kg_edges")
        .select("*")
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .in("source_id", nodeIds)
        .order("weight", { ascending: false })
        .limit(50),
      sb
        .from("kg_edges")
        .select("*")
        .eq("user_id", scope.userId)
        .eq("tenant_id", scope.tenantId)
        .in("target_id", nodeIds)
        .order("weight", { ascending: false })
        .limit(50),
    ]);

  if (nodesErr) {
    throw new Error(`[kg-query] fetch nodes failed: ${nodesErr.message}`);
  }

  const nodes = (nodesData ?? []) as KgNode[];
  // Dédupliquer edges (un edge peut sortir d'un node hit ET arriver dans un autre)
  const edgeMap = new Map<string, KgEdge>();
  for (const e of [...(outEdges ?? []), ...(inEdges ?? [])] as KgEdge[]) {
    edgeMap.set(e.id, e);
  }
  const edges = Array.from(edgeMap.values()).slice(0, 50);

  // 3. Optional narrative
  let narrative: string | null = null;
  if (params.withNarrative && nodes.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      const factsLines = [
        `Question utilisateur : ${params.question}`,
        ``,
        `Entités trouvées (top ${nodes.length}) :`,
        ...nodes.map(
          (n) => `- [${n.type}] ${n.label}${formatProperties(n.properties)}`,
        ),
        ``,
        `Relations (top ${edges.length}) :`,
        ...edges.slice(0, 30).map((e) => {
          const src = nodeById.get(e.source_id)?.label ?? e.source_id.slice(0, 8);
          const tgt = nodeById.get(e.target_id)?.label ?? e.target_id.slice(0, 8);
          return `- ${src} —[${e.type}]→ ${tgt}`;
        }),
      ].join("\n");

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await anthropic.messages.create({
        model: NARRATIVE_MODEL,
        max_tokens: NARRATIVE_MAX_TOKENS,
        system: [
          "Tu es un narrateur factuel du Knowledge Graph de l'utilisateur.",
          "Tu reçois des entités + relations, et tu produis 2-3 phrases denses qui :",
          "- Synthétisent ce que les données disent en lien avec la question.",
          "- Nomment les acteurs clés (personnes, entreprises, projets).",
          "- Restent strictement factuels — si les données ne couvrent pas la question, dis-le.",
          "Pas d'enrobage, pas de listing.",
        ].join("\n"),
        messages: [{ role: "user", content: factsLines }],
      });
      const block = res.content[0];
      narrative = block?.type === "text" ? block.text.trim() : null;
    } catch (err) {
      console.warn("[kg-query] narrative generation failed:", err);
    }
  }

  return { nodes, edges, narrative };
}

function formatProperties(props: Record<string, unknown> | null): string {
  if (!props) return "";
  const entries = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 3);
  if (entries.length === 0) return "";
  return ` (${entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")})`;
}

export function buildKgQueryTools(opts: { scope: TenantScope }): AiToolMap {
  const { scope } = opts;

  const queryKg: Tool<QueryKgArgs, unknown> = {
    description:
      "Cherche dans le Knowledge Graph de l'utilisateur (entités + relations extraites " +
      "de toutes ses conversations) des éléments pertinents à une question. Retourne les " +
      "nodes/edges qui matchent + (optionnel) un résumé narratif. Use this when the user asks " +
      "'que sais-tu sur X?', 'résume ce que je sais sur Y', 'quelles relations entre A et B?', " +
      "'qui m'a parlé de Z?'. Cross-thread : couvre toutes les conversations du user.",
    inputSchema: jsonSchema<QueryKgArgs>({
      type: "object",
      required: ["question"],
      properties: {
        question: {
          type: "string",
          description:
            "Question en français/anglais. Sera embeddée pour recherche sémantique.",
        },
        withNarrative: {
          type: "boolean",
          description:
            "Si true, génère un résumé narratif Sonnet (2-3 phrases). Default false " +
            "(juste les nodes/edges bruts, plus rapide).",
        },
        limit: {
          type: "number",
          description: "Top-K nodes à retourner (default 8, max 20).",
        },
      },
    }),
    execute: async (args) => {
      const question = args.question.trim();
      if (!question) return "Erreur : question vide.";
      if (!scope.userId) return "Erreur : userId manquant dans le scope.";

      try {
        const result = await runKgQuery(
          { userId: scope.userId, tenantId: scope.tenantId },
          {
            question,
            withNarrative: args.withNarrative,
            limit: args.limit,
          },
        );

        if (result.nodes.length === 0) {
          return `Aucune entité pertinente trouvée dans le KG pour "${question}".`;
        }

        const summary = [
          `${result.nodes.length} entité(s) + ${result.edges.length} relation(s) trouvées :`,
          ...result.nodes.map(
            (n) => `- [${n.type}] ${n.label}${formatProperties(n.properties)}`,
          ),
          result.narrative ? `\nSynthèse :\n${result.narrative}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return summary;
      } catch (err) {
        console.error("[query_knowledge_graph] failed:", err);
        return `Erreur recherche KG : ${err instanceof Error ? err.message : "unknown"}`;
      }
    },
  };

  return {
    query_knowledge_graph: queryKg,
  };
}

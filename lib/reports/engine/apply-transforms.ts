/**
 * Dispatcher : applique le DAG de transforms d'un ReportSpec aux datasets
 * sources, dans l'ordre topologique. Chaque op produit un nouveau dataset
 * indexé par son `id` dans le `datasets` map en sortie.
 *
 * Cache L2 (transform_cache) consulté avant exécution. Clé = hash de
 * (op + params + hashes des inputs amont). Si tous les amonts sont
 * cache-hits ou identiques, le résultat est servi du cache.
 */

import type { TransformOp } from "@/lib/reports/spec/schema";
import {
  filter,
  join,
  groupBy,
  windowOp,
  diff,
  rank,
  derive,
  pivot,
  unionAll,
  type Tabular,
} from "./tabular";
import { getTransformCache, hashKey, setTransformCache } from "./cache";

export interface ApplyTransformsContext {
  /** TTL en secondes pour le cache L2 (transform). */
  cacheTtlSeconds: number;
  /** Désactive le cache (utile pour tests / forçage). */
  noCache?: boolean;
  /** Ancrage temporel (ms epoch) — fixé pour la déterminisme du run. */
  now?: number;
}

/**
 * Applique tous les transforms en respectant le DAG.
 *
 * @param sources  map id source → Tabular (déjà fetchées via fetch-sources)
 * @param transforms  liste ordonnée ou non ; on tri topologiquement ici
 * @param ctx
 * @returns map { id → Tabular } incluant les sources + les transforms calculés
 */
export async function applyTransforms(
  sources: ReadonlyMap<string, Tabular>,
  transforms: ReadonlyArray<TransformOp>,
  ctx: ApplyTransformsContext,
): Promise<Map<string, Tabular>> {
  const datasets = new Map<string, Tabular>(sources);
  // Mémoire des hashes d'amont pour construire la clé de cache.
  const datasetHash = new Map<string, string>();
  for (const [id, table] of sources.entries()) {
    datasetHash.set(id, hashKey(table));
  }

  const ordered = topoSort(transforms);

  for (const op of ordered) {
    // Vérifie que tous les inputs sont calculés
    for (const inp of op.inputs) {
      if (!datasets.has(inp)) {
        throw new Error(
          `transform '${op.id}' attend un dataset '${inp}' qui n'existe pas`,
        );
      }
    }

    // Clé de cache : combinée à partir des hashes amont + de la spec de l'op.
    const inputHashes = op.inputs.map((i) => datasetHash.get(i) ?? "");
    const cacheKeyData = {
      op: op.op,
      params: op.params,
      inputHashes,
    };
    const cacheKey = hashKey(cacheKeyData);

    let result: Tabular | null = null;

    if (!ctx.noCache) {
      const cached = await getTransformCache<Tabular>(cacheKey);
      if (cached) result = cached;
    }

    if (result === null) {
      result = runOp(op, datasets, ctx);
      if (!ctx.noCache) {
        // fire-and-forget : on n'attend pas le persist
        void setTransformCache(cacheKey, result, ctx.cacheTtlSeconds);
      }
    }

    datasets.set(op.id, result);
    datasetHash.set(op.id, hashKey(result));
  }

  return datasets;
}

/**
 * Tri topologique : un transform peut référencer une source ou un autre
 * transform en amont. On ré-ordonne pour que l'amont soit toujours produit
 * avant l'aval. Détecte les cycles.
 */
function topoSort(transforms: ReadonlyArray<TransformOp>): TransformOp[] {
  const byId = new Map<string, TransformOp>();
  for (const t of transforms) byId.set(t.id, t);

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: TransformOp[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`cycle détecté dans les transforms autour de '${id}'`);
    }
    const t = byId.get(id);
    if (!t) return; // c'est probablement une source — ok
    visiting.add(id);
    for (const inp of t.inputs) visit(inp);
    visiting.delete(id);
    visited.add(id);
    sorted.push(t);
  }

  for (const t of transforms) visit(t.id);
  return sorted;
}

/**
 * Dispatch vers la bonne op tabulaire. Le typage discriminé du Spec garantit
 * que les params correspondent à la signature.
 */
function runOp(
  op: TransformOp,
  datasets: ReadonlyMap<string, Tabular>,
  ctx: ApplyTransformsContext,
): Tabular {
  switch (op.op) {
    case "filter":
      return filter(get(datasets, op.inputs[0]), op.params);
    case "join":
      return join(
        get(datasets, op.inputs[0]),
        get(datasets, op.inputs[1]),
        op.params,
      );
    case "groupBy":
      return groupBy(get(datasets, op.inputs[0]), op.params);
    case "window":
      return windowOp(get(datasets, op.inputs[0]), {
        ...op.params,
        now: ctx.now,
      });
    case "diff":
      return diff(get(datasets, op.inputs[0]), {
        ...op.params,
        now: ctx.now,
      });
    case "rank":
      return rank(get(datasets, op.inputs[0]), op.params);
    case "derive":
      return derive(get(datasets, op.inputs[0]), op.params);
    case "pivot":
      return pivot(get(datasets, op.inputs[0]), op.params);
    case "unionAll":
      return unionAll(...op.inputs.map((i) => get(datasets, i)));
  }
}

function get(datasets: ReadonlyMap<string, Tabular>, id: string): Tabular {
  const t = datasets.get(id);
  if (!t) throw new Error(`dataset '${id}' introuvable`);
  return t;
}

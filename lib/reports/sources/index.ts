/**
 * Source loader unifié — implémentation prod du `SourceLoader` injecté dans
 * runReport. Dispatch par kind vers l'adapter approprié, gère le cache L1,
 * applique les mappings. Parallélisme borné à 3 pour ne pas saturer les
 * rate-limits Composio / Google.
 */

import type { SourceRef, ReportSpec } from "@/lib/reports/spec/schema";
import type { Tabular } from "@/lib/reports/engine/tabular";
import type { SourceLoader } from "@/lib/reports/engine/run-report";
import {
  getSourceCache,
  setSourceCache,
  hashKey,
} from "@/lib/reports/engine/cache";
import { applyMapping } from "./extract";
import { fetchComposio } from "./composio";
import { fetchGoogle, type GoogleService } from "./google";
import { fetchHttp } from "./http";
import { fetchAsset } from "./asset";

const CONCURRENCY_CAP = 3;

interface LoaderOptions {
  noCache?: boolean;
  /** Override du TTL si fourni — sinon on utilise spec.cacheTTL.raw au call. */
  ttlSeconds?: number;
  /** Bucket temporel : permet de garder le hash stable sur 60s. */
  dateBucketSeconds?: number;
}

/**
 * Construit un SourceLoader prêt à passer à runReport.
 */
export function createSourceLoader(
  options: LoaderOptions & { spec: ReportSpec },
): SourceLoader {
  const { spec, noCache, ttlSeconds, dateBucketSeconds = 60 } = options;

  return async (sources, scope) => {
    const out = new Map<string, Tabular>();
    const queue = [...sources];

    while (queue.length > 0) {
      const batch = queue.splice(0, CONCURRENCY_CAP);
      const results = await Promise.all(
        batch.map(async (src): Promise<[string, Tabular]> => {
          const rows = await loadOne(src, scope, {
            noCache,
            ttlSeconds: ttlSeconds ?? spec.cacheTTL.raw,
            dateBucketSeconds,
          });
          return [src.id, rows];
        }),
      );
      for (const [id, rows] of results) out.set(id, rows);
    }

    return out;
  };
}

interface LoadOneOpts {
  noCache?: boolean;
  ttlSeconds: number;
  dateBucketSeconds: number;
}

async function loadOne(
  src: SourceRef,
  scope: ReportSpec["scope"],
  opts: LoadOneOpts,
): Promise<Tabular> {
  // Clé de cache : kind + spec + scope + bucket temporel.
  const bucket = Math.floor(Date.now() / (opts.dateBucketSeconds * 1000));
  const cacheKey = hashKey({ kind: src.kind, spec: src.spec, scope, bucket });

  if (!opts.noCache) {
    const cached = await getSourceCache<Tabular>(cacheKey);
    if (cached) return applyMapping(cached, src.mapping);
  }

  let rows: Tabular = [];

  if (src.kind === "composio") {
    if (!scope.userId) {
      console.warn(
        `[reports/sources] composio source '${src.id}' nécessite un userId — ignoré`,
      );
    } else {
      const r = await fetchComposio({
        action: src.spec.action,
        params: src.spec.params,
        userId: scope.userId,
      });
      if (!r.ok) {
        console.warn(
          `[reports/sources] composio '${src.spec.action}' a échoué : ${r.error}`,
        );
      }
      rows = r.rows;
    }
  } else if (src.kind === "native_google") {
    if (!scope.userId) {
      console.warn(
        `[reports/sources] google source '${src.id}' nécessite un userId — ignoré`,
      );
    } else {
      const r = await fetchGoogle({
        service: src.spec.service as GoogleService,
        op: src.spec.op,
        params: src.spec.params,
        userId: scope.userId,
      });
      if (!r.ok) {
        console.warn(
          `[reports/sources] google '${src.spec.service}.${src.spec.op}' a échoué : ${r.error}`,
        );
      }
      rows = r.rows;
    }
  } else if (src.kind === "http") {
    const r = await fetchHttp({
      url: src.spec.url,
      method: src.spec.method,
      headers: src.spec.headers,
      body: src.spec.body,
    });
    if (!r.ok) {
      console.warn(`[reports/sources] http '${src.spec.url}' a échoué : ${r.error}`);
    }
    rows = r.rows;
  } else if (src.kind === "asset") {
    const r = await fetchAsset({
      assetId: src.spec.assetId,
      format: src.spec.format,
    });
    if (!r.ok) {
      console.warn(
        `[reports/sources] asset ${src.spec.assetId} a échoué : ${r.error}`,
      );
    }
    rows = r.rows;
  }

  if (!opts.noCache && rows.length > 0) {
    void setSourceCache(cacheKey, rows, opts.ttlSeconds);
  }

  return applyMapping(rows, src.mapping);
}

// Re-exports pour les tests / consommateurs ─────────────────
export { fetchComposio } from "./composio";
export { fetchGoogle } from "./google";
export { fetchHttp } from "./http";
export { fetchAsset } from "./asset";
export { extractTabular, applyMapping } from "./extract";

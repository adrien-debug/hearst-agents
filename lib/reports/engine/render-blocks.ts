/**
 * Render des blocks d'un ReportSpec en payload JSON sérialisable.
 *
 * **Aucun SVG côté serveur** — le client (lib/reports/blocks/*.tsx) consomme
 * ce payload et fait le rendu. Cela permet de :
 *   - cacher le payload (JSONB) sans cacher du HTML qui dépend du thème UI
 *   - rendre dynamiquement dans le focal sans pré-render serveur
 *   - réutiliser le même payload pour PDF/CSV/email plus tard
 *
 * Format de sortie (consommé par FocalStage + ReportLayout) :
 * {
 *   __reportPayload: true,    // magic key pour le détecteur côté Focal
 *   specId, version, generatedAt,
 *   blocks: [
 *     { id, type, label?, layout, data, props }
 *   ],
 *   scalars: { ... }    // KPIs extraits, fournis à la narration
 * }
 */

import type { BlockSpec, ReportSpec } from "@/lib/reports/spec/schema";
import type { Tabular } from "./tabular";

export interface RenderedBlock {
  id: string;
  type: BlockSpec["type"];
  label?: string;
  layout: BlockSpec["layout"];
  /** Données livrées au composant client. Shape libre, contraint par primitive. */
  data: unknown;
  /** Props additionnels qui n'affectent pas la donnée mais le visuel. */
  props: Record<string, unknown>;
}

/**
 * Source citée par les blocks via `<sup data-source-id="...">[N]</sup>`. Le
 * runner peuple ce tableau depuis spec.sources (id + label dérivés). Le
 * composant React `SourceCitation` (côté client) lit cette liste et attache
 * tooltip + drill-down au clic sur les sup.
 */
export interface RenderedSource {
  id: string;
  label: string;
  url?: string;
  assetId?: string;
  fetchedAt?: number;
}

export interface RenderPayload {
  __reportPayload: true;
  specId: string;
  version: number;
  generatedAt: number;
  blocks: RenderedBlock[];
  /** Scalaires extraits pour narration LLM (jamais le raw). */
  scalars: Record<string, unknown>;
  /**
   * Sources citables. Optionnel pour back-compat (ancien payload sans sources
   * reste valide). Quand présent, ReportLayout wrap la grille dans
   * SourceCitation pour activer les citations cliquables.
   */
  sources?: RenderedSource[];
}

/**
 * Limite agressive sur le nombre de rows transmises au client. Au-delà, on
 * remonte les top-N par défaut pour éviter de saturer le payload.
 */
const MAX_ROWS_PER_BLOCK = 200;

export function renderBlocks(
  spec: ReportSpec,
  datasets: ReadonlyMap<string, Tabular>,
  generatedAt: number,
): RenderPayload {
  const blocks: RenderedBlock[] = [];
  const scalars: Record<string, unknown> = {};

  for (const block of spec.blocks) {
    const data = datasets.get(block.dataRef);
    if (!data) {
      throw new Error(
        `block '${block.id}' référence le dataset '${block.dataRef}' qui n'a pas été calculé`,
      );
    }
    const trimmed = trimRows(data, block);
    const rendered: RenderedBlock = {
      id: block.id,
      type: block.type,
      label: block.label,
      layout: block.layout,
      data: shapeData(block, trimmed),
      props: block.props ?? {},
    };
    blocks.push(rendered);
    extractScalars(block, trimmed, scalars);
  }

  return {
    __reportPayload: true,
    specId: spec.id,
    version: spec.version,
    generatedAt,
    blocks,
    scalars,
  };
}

// ── Trim & shape par type de primitive ─────────────────────

function trimRows(data: Tabular, block: BlockSpec): Tabular {
  if (data.length <= MAX_ROWS_PER_BLOCK) return data;

  // Pour table/sparkline/calendar_heatmap : on garde les premières rows.
  // Pour bar/funnel/pareto : on remonte les top-N par valeur si props.valueField
  //   est défini. Sinon, premières rows.
  const valueField = block.props?.valueField as string | undefined;
  if (
    valueField &&
    (block.type === "bar" || block.type === "funnel" || block.type === "pareto")
  ) {
    return [...data]
      .sort((a, b) => Number(b[valueField] ?? 0) - Number(a[valueField] ?? 0))
      .slice(0, MAX_ROWS_PER_BLOCK);
  }
  return data.slice(0, MAX_ROWS_PER_BLOCK);
}

/**
 * Shape la donnée selon le type. Pour V1, on reste simple : on transmet
 * la Tabular brute, le composant client lit `props.fieldX` pour savoir où
 * trouver les valeurs. Cela évite de dupliquer la spec de chaque primitive
 * côté serveur.
 *
 * Exception : `kpi` pour qui on extrait directement la valeur scalaire,
 * c'est le cas le plus fréquent et le client n'a pas à sniffer la première row.
 */
function shapeData(block: BlockSpec, data: Tabular): unknown {
  if (block.type === "kpi") {
    const field = (block.props?.field as string) ?? "value";
    const deltaField = block.props?.deltaField as string | undefined;
    const sparklineField = block.props?.sparklineField as string | undefined;
    const first = data[0] ?? {};

    return {
      value: first[field] ?? null,
      delta: deltaField ? (first[deltaField] ?? null) : null,
      sparkline: sparklineField
        ? data
            .map((r) => r[sparklineField])
            .filter((v) => typeof v === "number" && Number.isFinite(v as number))
        : null,
    };
  }

  // Pour les autres types V1 : on passe le Tabular tel quel.
  return data;
}

/**
 * Extrait les scalaires des blocks `kpi` (et la première valeur des autres si
 * applicable) pour les fournir à la narration. Volume cible : <50 scalaires
 * total. Garde uniquement les types JSON-natifs primitifs.
 *
 * Sous-scalaires (V2) : un block KPI peut déclarer `props.subScalars` =
 * Record<scalarName, sourceField> pour exposer des champs additionnels comme
 * `baseline`, `baseline_3m`, `previous`, `mau`. Ces clés sont publiées sous
 * le nom `{blockId}.{scalarName}` et consommées par les rules signals
 * composites (extract.ts).
 */
function extractScalars(
  block: BlockSpec,
  data: Tabular,
  scalars: Record<string, unknown>,
): void {
  if (block.type === "kpi") {
    const field = (block.props?.field as string) ?? "value";
    const deltaField = block.props?.deltaField as string | undefined;
    const first = data[0] ?? {};
    if (isPrimitive(first[field])) {
      scalars[`${block.id}.value`] = first[field];
    }
    if (deltaField && isPrimitive(first[deltaField])) {
      scalars[`${block.id}.delta`] = first[deltaField];
    }

    // Sous-scalaires arbitraires déclarés par le catalogue.
    const subScalars = block.props?.subScalars;
    if (isStringRecord(subScalars)) {
      for (const [name, sourceField] of Object.entries(subScalars)) {
        if (typeof sourceField !== "string") continue;
        const v = first[sourceField];
        if (isPrimitive(v)) {
          scalars[`${block.id}.${name}`] = v;
        }
      }
    }
  }
  // Pour les blocs non-kpi, on prend la longueur (utile à la narration).
  scalars[`${block.id}.count`] = data.length;
}

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

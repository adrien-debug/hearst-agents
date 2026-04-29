/**
 * diffVersions — diff déterministe, structurel, sans LLM.
 *
 * Compare deux RenderPayload block par block via block.id.
 * Détecte :
 *  - blocks ajoutés / supprimés
 *  - changements de valeur KPI (data.value)
 *  - changements de nombre de rows pour table/bar/sparkline/funnel
 *  - changement de narration (via champ optionnel narration sur VersionFull)
 *
 * Un VersionDiff est immuable et sérialisable JSON.
 */

import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";

// ── Types ─────────────────────────────────────────────────────

export type DiffKind = "added" | "removed" | "changed";

export interface VersionDiff {
  blockRef: string;
  kind: DiffKind;
  fieldPath?: string;
  before?: unknown;
  after?: unknown;
}

// ── Helpers ───────────────────────────────────────────────────

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function rowCount(block: RenderedBlock): number | undefined {
  if (Array.isArray(block.data)) return block.data.length;
  return undefined;
}

function kpiValue(block: RenderedBlock): number | undefined {
  const data = block.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return undefined;
  return safeNumber(data["value"]);
}

// ── diffVersions ──────────────────────────────────────────────

/**
 * Retourne la liste des diffs entre versionA (ancienne) et versionB (nouvelle).
 * Les deux payloads sont comparés structurellement ; aucun appel LLM.
 *
 * @param narrationA  narration de la versionA (optionnel)
 * @param narrationB  narration de la versionB (optionnel)
 */
export function diffVersions(
  versionA: RenderPayload,
  versionB: RenderPayload,
  narrationA?: string | null,
  narrationB?: string | null,
): VersionDiff[] {
  const diffs: VersionDiff[] = [];

  const blocksA = new Map<string, RenderedBlock>(
    versionA.blocks.map((b) => [b.id, b]),
  );
  const blocksB = new Map<string, RenderedBlock>(
    versionB.blocks.map((b) => [b.id, b]),
  );

  // Blocks supprimés (dans A, pas dans B)
  for (const [id] of blocksA) {
    if (!blocksB.has(id)) {
      diffs.push({ blockRef: id, kind: "removed" });
    }
  }

  // Blocks ajoutés (dans B, pas dans A)
  for (const [id] of blocksB) {
    if (!blocksA.has(id)) {
      diffs.push({ blockRef: id, kind: "added" });
    }
  }

  // Blocks présents dans les deux — comparaison par type
  for (const [id, blockB] of blocksB) {
    const blockA = blocksA.get(id);
    if (!blockA) continue; // ajouté, déjà géré

    // KPI : compare data.value
    if (blockA.type === "kpi" || blockB.type === "kpi") {
      const valA = kpiValue(blockA);
      const valB = kpiValue(blockB);
      if (valA !== undefined && valB !== undefined && valA !== valB) {
        diffs.push({
          blockRef: id,
          kind: "changed",
          fieldPath: "data.value",
          before: valA,
          after: valB,
        });
      }
    }

    // Table / bar / sparkline / funnel : compare row count
    const typesWithRows: RenderedBlock["type"][] = [
      "table", "bar", "sparkline", "funnel",
    ];
    if (typesWithRows.includes(blockA.type) || typesWithRows.includes(blockB.type)) {
      const countA = rowCount(blockA);
      const countB = rowCount(blockB);
      if (countA !== undefined && countB !== undefined && countA !== countB) {
        diffs.push({
          blockRef: id,
          kind: "changed",
          fieldPath: "data.rowCount",
          before: countA,
          after: countB,
        });
      }
    }
  }

  // Narration
  if (
    narrationA !== undefined &&
    narrationB !== undefined &&
    narrationA !== narrationB
  ) {
    diffs.push({
      blockRef: "__narration__",
      kind: "changed",
      fieldPath: "narration",
      before: narrationA ?? null,
      after: narrationB ?? null,
    });
  }

  return diffs;
}

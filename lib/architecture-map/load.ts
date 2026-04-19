/**
 * Architecture Map — loader.
 *
 * Reads and validates docs/architecture-map.json.
 * Returns typed data or throws with clear error.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { ArchitectureMap } from "./types";

let cached: ArchitectureMap | null = null;

export function loadArchitectureMap(): ArchitectureMap {
  if (cached) return cached;

  const filePath = join(process.cwd(), "docs", "architecture-map.json");

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `[ArchitectureMap] Failed to read docs/architecture-map.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[ArchitectureMap] Invalid JSON in docs/architecture-map.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const map = data as ArchitectureMap;

  if (!map.meta || !map.ui_surfaces || !map.agents || !map.runtime_components || !map.flows) {
    throw new Error("[ArchitectureMap] Malformed architecture map — missing required sections");
  }

  cached = map;
  return map;
}

export function invalidateCache(): void {
  cached = null;
}

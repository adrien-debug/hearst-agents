/**
 * .env.local loader minimal pour scripts standalone Node (npx tsx).
 *
 * Pas de dépendance dotenv. Parse `KEY=value` ligne par ligne, strip
 * quotes, ignore commentaires + lignes vides. Préserve les vars déjà
 * définies dans `process.env` (priorité au runtime).
 *
 * Usage :
 *   import { loadEnv } from "./lib/load-env";
 *   loadEnv();
 *   // process.env.NEXT_PUBLIC_SUPABASE_URL est désormais peuplé
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(envPath = ".env.local"): void {
  try {
    const fullPath = join(process.cwd(), envPath);
    const content = readFileSync(fullPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local optional — rely on process.env (CI, prod).
  }
}

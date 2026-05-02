/**
 * Build script pour le main process Electron.
 *
 * - main.ts    → dist/electron/main.mjs   (ESM — Electron 37+ intercepte les ESM imports)
 * - preload.ts → dist/electron/preload.js (CJS — les preloads doivent rester CJS)
 *
 * `electron` est marqué "external" pour que le require/import soit résolu
 * par le runtime Electron et non par node_modules.
 */

import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const outDir = "dist/electron";
mkdirSync(outDir, { recursive: true });

// Main process — ESM
await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["electron"],
  outfile: join(outDir, "main.mjs"),
  minify: false,
  sourcemap: false,
});

// Preload — CJS (Electron preloads ne supportent pas ESM dans tous les contextes)
await build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: join(outDir, "preload.js"),
  minify: false,
  sourcemap: false,
});

// Package.json pour indiquer à Node que dist/electron/ est ESM
writeFileSync(
  join(outDir, "package.json"),
  JSON.stringify({ type: "module" }, null, 2),
);

console.log("✓ Electron main process compilé dans", outDir);

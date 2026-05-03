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
import { mkdirSync } from "fs";
import { join } from "path";

const outDir = "dist/electron";
mkdirSync(outDir, { recursive: true });

// Main process — CJS (require("electron") fonctionne nativement en CJS dans Electron)
await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: join(outDir, "main.js"),
  minify: false,
  sourcemap: false,
});

// Preload — CJS
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

console.log("✓ Electron main process compilé dans", outDir);

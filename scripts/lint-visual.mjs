#!/usr/bin/env node
/**
 * Visual lint — bans hardcoding in app/**\/*.tsx.
 *
 * - Hex color literals (allowlist below for legitimate brand colors).
 * - Arbitrary `text-[Npx]` font sizes (use `.t-N` utilities or Tailwind text-xs/sm/base/...).
 *
 * Run: npm run lint:visual
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "app");

// Hex literals matching this regex are flagged.
const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

// Brand colors — third-party identity, not part of our visual system.
const BRAND_ALLOWLIST = new Set([
  "#0078D4", // Microsoft
  "#0364B8", // Microsoft Outlook
  "#28A8EA", // Microsoft Teams
  "#4285F4", // Google blue
  "#34A853", // Google green
  "#FBBC05", // Google yellow
  "#EA4335", // Google red
]);

const TEXT_PX_RE = /text-\[\d+px\]/g;

const SKIP_DIRS = new Set(["node_modules", ".next", "test-results", ".git"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(full);
    } else if (st.isFile() && entry.endsWith(".tsx")) {
      yield full;
    }
  }
}

const violations = [];
for (const file of walk(SCAN_DIR)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const ln = i + 1;

    for (const match of line.matchAll(HEX_RE)) {
      const hex = match[0].toUpperCase();
      const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
      if (BRAND_ALLOWLIST.has(normalized)) continue;
      violations.push({
        file: relative(ROOT, file),
        line: ln,
        col: match.index + 1,
        rule: "no-hex",
        text: match[0],
        snippet: line.trim(),
      });
    }

    for (const match of line.matchAll(TEXT_PX_RE)) {
      violations.push({
        file: relative(ROOT, file),
        line: ln,
        col: match.index + 1,
        rule: "no-arbitrary-text-size",
        text: match[0],
        snippet: line.trim(),
      });
    }
  });
}

if (violations.length === 0) {
  console.log("lint:visual ✓ no hardcoded hex / text-[Npx] in app/**/*.tsx");
  process.exit(0);
}

const byRule = violations.reduce((acc, v) => {
  (acc[v.rule] ??= []).push(v);
  return acc;
}, {});

console.error(`lint:visual ✗ ${violations.length} violation(s)\n`);

if (byRule["no-hex"]) {
  console.error(`-- no-hex (${byRule["no-hex"].length}) — replace with var(--token):`);
  for (const v of byRule["no-hex"]) {
    console.error(`   ${v.file}:${v.line}:${v.col}  ${v.text}`);
  }
  console.error("");
}

if (byRule["no-arbitrary-text-size"]) {
  console.error(
    `-- no-arbitrary-text-size (${byRule["no-arbitrary-text-size"].length}) — use .t-N utilities or Tailwind classes:`,
  );
  for (const v of byRule["no-arbitrary-text-size"]) {
    console.error(`   ${v.file}:${v.line}:${v.col}  ${v.text}`);
  }
  console.error("");
}

process.exit(1);

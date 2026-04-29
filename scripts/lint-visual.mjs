#!/usr/bin/env node
/**
 * Visual lint — bloque les violations du design system dans app/**\/*.tsx.
 *
 * Deux niveaux :
 * - règles globales (s'appliquent à tout app/) : pas de couleur hex hors brand,
 *   pas de `text-[Npx]`, pas de `tracking-[Nem]` arbitraire, pas de `rgba()`
 *   en littéral, pas de `shadow-{2xl,xl,lg,md,sm}` Tailwind brut.
 * - règles strict (uniquement dans STRICT_PATHS) : interdiction de magic px
 *   en inline `style={{ … }}`, interdiction de `bg-[…]` / `text-[…]` /
 *   `rounded-[…]` qui ne pointent pas vers une `var(--token)`.
 *
 * Le scope strict s'élargit fichier par fichier au fur et à mesure du clean.
 *
 * Per-file opt-out : `// lint-visual-disable-file` dans les 5 premières lignes.
 *
 * Run : npm run lint:visual
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, "app");

// Fichiers/dossiers où TOUTES les règles s'appliquent (strict + globales).
// On élargit ce tableau au fil du nettoyage. Match par prefix (relative path).
const STRICT_PATHS = [
  "app/(user)/components/right-panel/",
  "app/(user)/components/",
];

const SKIP_DIRS = new Set(["node_modules", ".next", "test-results", ".git"]);

// — Règles globales —

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const BRAND_ALLOWLIST = new Set([
  "#0078D4", "#0364B8", "#28A8EA",
  "#4285F4", "#34A853", "#FBBC05", "#EA4335",
]);

const TEXT_PX_RE = /text-\[\d+px\]/g;

// `tracking-[Nem]` ou `tracking-[N.Mem]`. Ignore `hover:tracking-[…]` (effets intentionnels).
const TRACKING_ARB_RE = /(?<!:)tracking-\[\d+(?:\.\d+)?em\]/g;

// `rgba(…)` ou `rgb(…)` en source — devraient passer par tokens.
const RGBA_RE = /\brgba?\(\s*\d/g;

// Tailwind shadow utilities brutes (hors --shadow-*).
const TW_SHADOW_RE = /\bshadow-(?:2xl|xl|lg|md|sm)\b/g;

// — Règles strict (scope STRICT_PATHS) —

// Magic `<prop>: "Npx"` ou `<prop>: 'Npx'` en inline style. Liste blanche
// pour les valeurs neutres `0px`, `1px`, `2px` (bordures fines, dividers).
const STYLE_PX_RE = /(width|height|padding|margin|gap|top|left|right|bottom|max-width|min-width|max-height|min-height|borderRadius|maxWidth|minWidth|maxHeight|minHeight)\s*:\s*['"](\d+)px['"]/g;
const STYLE_PX_ALLOWED = new Set([0, 1, 2]);

// `bg-[…]` ou `text-[…]` ou `rounded-[…]` qui ne contient pas `var(`.
const ARB_NON_TOKEN_RE = /\b(?:bg|text|border|rounded|fill|stroke)-\[(?!var\()[^\]]+\]/g;

// Inline `boxShadow:` dans style avec une valeur qui n'est PAS un token
// --shadow-*. `boxShadow: "var(--shadow-card)"` est OK — c'est du token.
const STYLE_SHADOW_RE = /\b(?:box-shadow|boxShadow)\s*:\s*['"](?!var\(--shadow-)[^'"]*['"]/g;

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

function isStrict(relPath) {
  return STRICT_PATHS.some((p) => relPath.startsWith(p));
}

const violations = [];

for (const file of walk(SCAN_DIR)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const relPath = relative(ROOT, file);

  // File-level opt-out (5 premières lignes).
  const head = lines.slice(0, 5).join("\n");
  if (head.includes("lint-visual-disable-file")) continue;

  const strict = isStrict(relPath);

  lines.forEach((line, i) => {
    const ln = i + 1;

    // Ignore ligne entière si commentée.
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    const push = (rule, match) =>
      violations.push({
        file: relPath,
        line: ln,
        col: match.index + 1,
        rule,
        text: match[0],
        snippet: line.trim(),
      });

    // Globales — couleurs hex.
    for (const match of line.matchAll(HEX_RE)) {
      const hex = match[0].toUpperCase();
      const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
      if (BRAND_ALLOWLIST.has(normalized)) continue;
      push("no-hex", match);
    }

    // Globales — text-[Npx].
    for (const match of line.matchAll(TEXT_PX_RE)) push("no-arbitrary-text-size", match);

    if (!strict) return;

    // Strict — tracking-[Nem] arbitraire (hors hover:).
    for (const match of line.matchAll(TRACKING_ARB_RE)) push("no-arbitrary-tracking", match);

    // Strict — rgba()/rgb() littéral.
    for (const match of line.matchAll(RGBA_RE)) push("no-rgba", match);

    // Strict — shadow Tailwind brut (hors --shadow-*).
    for (const match of line.matchAll(TW_SHADOW_RE)) push("no-tailwind-shadow", match);

    // Strict — magic px en inline style.
    for (const match of line.matchAll(STYLE_PX_RE)) {
      const px = parseInt(match[2], 10);
      if (STYLE_PX_ALLOWED.has(px)) continue;
      push("no-magic-px-style", match);
    }

    // Strict — `*-[…]` non-token.
    for (const match of line.matchAll(ARB_NON_TOKEN_RE)) push("no-arbitrary-non-token", match);

    // Strict — boxShadow inline.
    for (const match of line.matchAll(STYLE_SHADOW_RE)) push("no-inline-shadow", match);
  });
}

if (violations.length === 0) {
  console.log("lint:visual ✓ aucune violation détectée");
  process.exit(0);
}

const byRule = violations.reduce((acc, v) => {
  (acc[v.rule] ??= []).push(v);
  return acc;
}, {});

const RULE_HINTS = {
  "no-hex": "remplacer par var(--token-couleur).",
  "no-arbitrary-text-size": "utiliser .t-N (.t-9, .t-11, .t-13, .t-15, .t-18…).",
  "no-arbitrary-tracking": "utiliser tracking-section / tracking-display / tracking-stretch / tracking-label / etc.",
  "no-rgba": "définir un token --xxx-bg ou --xxx-tint dans globals.css au lieu de rgba inline.",
  "no-tailwind-shadow": "utiliser var(--shadow-card) / --shadow-card-hover / --shadow-input-focus.",
  "no-magic-px-style": "utiliser var(--space-N) ou var(--width-/--height-/--size-XXX). Si le token manque, le rajouter dans globals.css.",
  "no-arbitrary-non-token": "remplir le bracket avec var(--token), ex: bg-[var(--surface-1)].",
  "no-inline-shadow": "utiliser box-shadow: var(--shadow-XXX).",
};

console.error(`lint:visual ✗ ${violations.length} violation(s)\n`);

const ORDERED = [
  "no-hex",
  "no-arbitrary-text-size",
  "no-arbitrary-tracking",
  "no-rgba",
  "no-tailwind-shadow",
  "no-magic-px-style",
  "no-arbitrary-non-token",
  "no-inline-shadow",
];

for (const rule of ORDERED) {
  const list = byRule[rule];
  if (!list) continue;
  console.error(`-- ${rule} (${list.length}) — ${RULE_HINTS[rule]}`);
  for (const v of list) {
    console.error(`   ${v.file}:${v.line}:${v.col}  ${v.text}`);
  }
  console.error("");
}

process.exit(1);

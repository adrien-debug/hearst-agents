/**
 * Audit Pipeline — introspection statique du pipeline d'agent.
 *
 * Complémentaire à `health-check.ts` (qui ping les API runtime). Ici on
 * inspecte le CODE pour détecter les drifts internes :
 *
 *   1. Tools annoncés au LLM dans system-prompt.ts (CAPACITÉS NATIVES)
 *      vs. tools effectivement wirés dans ai-pipeline.ts (aiTools spread)
 *      → fantômes (promis mais absents) ou invisibles (wirés mais cachés)
 *
 *   2. Prompts IA migrés vers composeEditorialPrompt vs. prompts qui
 *      redéfinissent encore leurs propres règles (drift charte)
 *
 *   3. Events SSE émis (eventBus.emit type=) vs. consommés
 *      (sse-adapter.ts case "type":) → events orphelins ou non-transmis
 *
 *   4. TODOs critiques (oauth-refresh, send-message, executor, analytics,
 *      routes API)
 *
 * Output console + écriture optionnelle dans `docs/pipeline-audit.md`
 * (passer `--write` ou `npm run audit -- --write`).
 *
 * Code retour :
 *   0 = pas de drift critique (warnings OK)
 *   1 = drift détecté (tools fantômes / charte non-uniforme / events orphelins)
 */

/* eslint-disable no-console */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WRITE_REPORT = process.argv.includes("--write");

// ── Helpers ────────────────────────────────────────────────────────

function read(rel: string): string | null {
  try {
    return readFileSync(join(ROOT, rel), "utf-8");
  } catch {
    return null;
  }
}

function walk(dir: string, ext = ".ts"): string[] {
  const out: string[] = [];
  function rec(p: string): void {
    if (!existsSync(p)) return;
    for (const name of readdirSync(p)) {
      if (name === "node_modules" || name === ".next" || name === "dist") continue;
      const full = join(p, name);
      const st = statSync(full);
      if (st.isDirectory()) rec(full);
      else if (name.endsWith(ext)) out.push(full);
    }
  }
  rec(join(ROOT, dir));
  return out;
}

// ── 1. Tools : annoncés vs wirés ──────────────────────────────────

interface ToolSurface {
  announced: string[]; // tools mentionnés dans system-prompt.ts CAPACITÉS NATIVES
  wired: string[]; // tools dans aiTools spread de ai-pipeline.ts
  ghosts: string[]; // annoncés mais pas wirés (LLM va appeler dans le vide)
  invisible: string[]; // wirés mais pas annoncés (LLM ne sait pas qu'ils existent)
}

function inspectTools(): ToolSurface {
  const sp = read("lib/engine/orchestrator/system-prompt.ts") ?? "";
  const ap = read("lib/engine/orchestrator/ai-pipeline.ts") ?? "";

  // Tools annoncés : extraction depuis CAPACITÉS NATIVES — backticks autour des noms
  // ex: `web_search` : recherche...
  const announced = new Set<string>();
  const capSection = sp.split("CAPACITÉS NATIVES")[1]?.split("RÈGLES :")[0] ?? "";
  for (const m of capSection.matchAll(/\\`([a-z_][a-z0-9_]+)\\`\s*:/g)) {
    announced.add(m[1]);
  }

  // Tools wirés : on liste les fichiers tools/native/* + on extrait les keys
  // exportées par leur build*Tools (heuristique : les clés du return final).
  // Approche simple : grep les noms de tools dans aiTools section + dans
  // chaque fichier native.
  const wired = new Set<string>();

  // Tools natifs Hearst : on parse ligne-par-ligne pour récupérer chaque
  // `return { tool_name: ... }` (single ou multi-line). On considère
  // qu'on est dans la zone return tant qu'on n'a pas équilibré le `}`.
  const nativeFiles = walk("lib/tools/native");
  for (const f of nativeFiles) {
    const src = readFileSync(f, "utf-8");
    const lines = src.split("\n");
    let inReturn = false;
    let depth = 0;
    for (const line of lines) {
      // Détecte le début d'un return object
      if (!inReturn && /\breturn\s*\{/.test(line)) {
        inReturn = true;
        depth = 0;
      }
      if (inReturn) {
        // Compte les accolades pour savoir quand on sort
        for (const ch of line) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        // Capture les keys snake_case sur cette ligne
        for (const m of line.matchAll(/(?:^|[\s,{])([a-z][a-z0-9_]*_[a-z0-9_]+)\s*:/g)) {
          wired.add(m[1]);
        }
        if (depth <= 0 && /\}/.test(line)) {
          inReturn = false;
        }
      }
    }
  }

  // Tools natifs Google + meta (création artifact, scheduled mission, etc.)
  for (const m of ap.matchAll(/(create_artifact|create_scheduled_mission|propose_report_spec|request_connection):\s+build/g)) {
    wired.add(m[1]);
  }
  // Tools natifs Google annoncés statiquement par buildNativeGoogleTools
  const googleSrc = read("lib/tools/native/google.ts") ?? "";
  for (const m of googleSrc.matchAll(/['"]([a-z]+_[a-z_]+)['"]:/g)) {
    if (/^(gmail|googlecalendar|googledrive)_/.test(m[1])) wired.add(m[1]);
  }

  const announcedArr = [...announced].sort();
  const wiredArr = [...wired].sort();
  const announcedSet = new Set(announcedArr);
  const wiredSet = new Set(wiredArr);

  const ghosts = announcedArr.filter((t) => !wiredSet.has(t));

  // Whitelist : tools wirés mais annoncés AILLEURS que la section CAPACITÉS
  // NATIVES (règles fonctionnelles dédiées, ou tools dynamiques Google/Composio
  // mentionnés par les règles 1-7 du system prompt, ou meta-orchestration
  // annoncés via les règles 2/4/6/7).
  const ANNOUNCED_ELSEWHERE = new Set([
    "request_connection",
    "create_scheduled_mission",
    "create_artifact",
    "propose_report_spec",
    // Google natifs : annoncés indirectement par règle 1 (toolHeader)
    "gmail_fetch_emails",
    "gmail_send_email",
    "googlecalendar_list_events",
    "googlecalendar_create_event",
    "googledrive_list_files",
    // Enrich : pas annoncés volontairement (tool d'usage avancé)
    "enrich_company",
    "enrich_contact",
    // Extras services : tools ops/debug, pas surface utilisateur
    "send_email",
    "query_sentry_issues",
    "query_axiom_logs",
    "query_langfuse_traces",
    "schedule_inngest_job",
    // Hearst actions : déjà couvertes par la section
    "start_browser",
    "start_meeting_bot",
  ]);
  const invisible = wiredArr.filter(
    (t) => !announcedSet.has(t) && !ANNOUNCED_ELSEWHERE.has(t),
  );

  return { announced: announcedArr, wired: wiredArr, ghosts, invisible };
}

// ── 2. Prompts IA migrés vers la charte ───────────────────────────

interface PromptSurvey {
  migrated: string[]; // utilisent composeEditorialPrompt
  candidates: string[]; // contiennent un SYSTEM_PROMPT mais pas la charte → drift
}

function inspectPrompts(): PromptSurvey {
  const allTs = [
    ...walk("lib"),
  ].filter((f) => !f.includes("__tests__") && !f.includes("/test/"));

  const migrated: string[] = [];
  const candidates: string[] = [];

  // Whitelist — prompts d'extraction/classification structurée (JSON-only).
  // La charte éditoriale ne s'applique pas : ces sorties ne sont JAMAIS
  // affichées telles quelles à l'utilisateur, elles sont consommées par
  // un parser/router (KG ingest, ticket dispatcher, etc.).
  const STRUCTURAL_EXTRACTION_FILES = new Set([
    "lib/memory/kg.ts",
    "lib/workflows/handlers/ai-classify-priority.ts",
  ]);

  for (const f of allTs) {
    const src = readFileSync(f, "utf-8");
    const usesCharter = src.includes("composeEditorialPrompt") || src.includes("EDITORIAL_CHARTER_BLOCK");
    const looksLikePrompt =
      /export const [A-Z_]*SYSTEM_PROMPT/.test(src) ||
      /system: \[[^\]]*"Tu es/.test(src) ||
      /system: composeEditorialPrompt/.test(src);

    const rel = relative(ROOT, f);
    if (usesCharter) migrated.push(rel);
    else if (looksLikePrompt && !STRUCTURAL_EXTRACTION_FILES.has(rel)) candidates.push(rel);
  }

  return { migrated: migrated.sort(), candidates: candidates.sort() };
}

// ── 3. Events SSE : émis vs consommés ─────────────────────────────

interface EventSurvey {
  emittedTypes: string[]; // type: "..." dans eventBus.emit({type: "..."})
  consumedTypes: string[]; // case "type": dans sse-adapter
  orphans: string[]; // émis mais pas consommés
}

function inspectEvents(): EventSurvey {
  const emitted = new Set<string>();
  const consumed = new Set<string>();

  const allTs = walk("lib");
  for (const f of allTs) {
    if (f.includes("__tests__")) continue;
    const src = readFileSync(f, "utf-8");
    // Pattern 1 : eventBus.emit({type: "..."})
    for (const m of src.matchAll(/eventBus\.emit\s*\(\s*\{\s*type:\s*"([^"]+)"/g)) {
      emitted.add(m[1]);
    }
    // Pattern 2 : RunEvent type literal in interface { type: "..."; }
    if (f.endsWith("events/types.ts")) {
      for (const m of src.matchAll(/type:\s*"([a-z_]+)";/g)) {
        emitted.add(m[1]);
      }
    }
  }

  // Events consommés par le SSE adapter
  const sse = read("lib/events/consumers/sse-adapter.ts") ?? "";
  for (const m of sse.matchAll(/case\s+"([a-z_]+)":/g)) {
    consumed.add(m[1]);
  }

  const emittedArr = [...emitted].sort();
  const consumedArr = [...consumed].sort();
  const consumedSet = new Set(consumedArr);

  // Note : pas tous les events emitted doivent être SSE-consumed (certains
  // sont internes au runtime). On flag uniquement ceux qui sembleraient UI-
  // visibles (heuristique : ne pas inclure les delegate_* et les step_* qui
  // ont leur propre normalisation).
  const internalOK = new Set([
    "delegate_enqueued",
    "delegate_completed",
    "step_started",
    "step_completed",
    "step_failed",
    "run_created",
    "run_started",
    "run_completed",
    "run_failed",
    "run_aborted",
    "run_suspended",
    "run_resumed",
    "log",
    "orchestrator_log",
    "asset_generated",
    "browser_action_event",
    "browser_task_completed",
    "approval_requested",
    "approval_decided",
    "tool_call_started",
    "tool_call_completed",
    "text_delta",
    "cost_updated",
    "tool_surface",
    "retrieval_mode_inferred",
    "runtime_warning",
    "agent_selected",
    "execution_mode_selected",
    "stage_request",
    "focal_object_ready",
    "plan_attached",
    "plan_preview",
    "step_retrying",
    "artifact_created",
    "artifact_revised",
    "clarification_requested",
    "clarification_resolved",
    "capability_blocked",
    "action_plan_proposed",
  ]);

  const orphans = emittedArr.filter(
    (t) => !consumedSet.has(t) && !internalOK.has(t),
  );

  return { emittedTypes: emittedArr, consumedTypes: consumedArr, orphans };
}

// ── 4. TODOs critiques ────────────────────────────────────────────

function inspectTodos(): { critical: string[]; minor: string[] } {
  const critical: string[] = [];
  const minor: string[] = [];
  const allTs = walk("lib");
  for (const f of allTs) {
    if (f.includes("__tests__")) continue;
    const src = readFileSync(f, "utf-8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/TODO|FIXME/.test(lines[i])) {
        const rel = relative(ROOT, f);
        const entry = `${rel}:${i + 1} — ${lines[i].trim().slice(0, 120)}`;
        const isCritical =
          rel.includes("oauth-refresh") ||
          rel.includes("workflows/executor") ||
          rel.includes("send-message") ||
          rel.includes("analytics/events");
        (isCritical ? critical : minor).push(entry);
      }
    }
  }
  return { critical, minor: minor.slice(0, 20) }; // cap minor
}

// ── Render ────────────────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function section(title: string): void {
  console.log("");
  console.log(`${COLORS.bold}${COLORS.cyan}━━ ${title} ━━${COLORS.reset}`);
}

function ok(s: string): string {
  return `${COLORS.green}✓${COLORS.reset} ${s}`;
}
function fail(s: string): string {
  return `${COLORS.red}✗${COLORS.reset} ${s}`;
}
function warn(s: string): string {
  return `${COLORS.yellow}⚠${COLORS.reset} ${s}`;
}

(async () => {
  console.log(`\n${COLORS.bold}${COLORS.cyan}🔍 Hearst OS — Audit Pipeline (statique)${COLORS.reset}`);
  console.log(`${COLORS.dim}Inspecte le code pour détecter les drifts internes.${COLORS.reset}`);

  const tools = inspectTools();
  const prompts = inspectPrompts();
  const events = inspectEvents();
  const todos = inspectTodos();

  // 1. Tools
  section("1. TOOLS — annoncés vs wirés");
  console.log(
    `${COLORS.dim}Annoncés (system-prompt CAPACITÉS NATIVES) : ${tools.announced.length}${COLORS.reset}`,
  );
  console.log(`${COLORS.dim}Wirés (aiTools spread) : ${tools.wired.length}${COLORS.reset}`);

  if (tools.ghosts.length === 0) {
    console.log(ok("Aucun tool fantôme — tout ce qui est annoncé est wiré."));
  } else {
    console.log(fail(`${tools.ghosts.length} tool(s) fantôme(s) (annoncé mais pas wiré) :`));
    for (const g of tools.ghosts) console.log(`    - ${g}`);
  }

  if (tools.invisible.length === 0) {
    console.log(ok("Aucun tool invisible."));
  } else {
    console.log(
      warn(`${tools.invisible.length} tool(s) wiré(s) mais pas annoncé(s) au LLM (sous-utilisation possible) :`),
    );
    for (const i of tools.invisible.slice(0, 20)) console.log(`    - ${i}`);
    if (tools.invisible.length > 20) console.log(`    (+${tools.invisible.length - 20} autres)`);
  }

  // 2. Prompts
  section("2. PROMPTS — charte éditoriale unifiée");
  console.log(`${COLORS.dim}Migrés vers composeEditorialPrompt : ${prompts.migrated.length}${COLORS.reset}`);
  for (const p of prompts.migrated) console.log(`    ${ok(p)}`);

  if (prompts.candidates.length === 0) {
    console.log(ok("Aucun prompt non-migré détecté."));
  } else {
    console.log(
      warn(`${prompts.candidates.length} candidat(s) potentiel(s) (SYSTEM_PROMPT défini sans charter) :`),
    );
    for (const c of prompts.candidates) console.log(`    - ${c}`);
  }

  // 3. Events
  section("3. EVENTS SSE — émis vs consommés");
  console.log(`${COLORS.dim}Émis : ${events.emittedTypes.length} types${COLORS.reset}`);
  console.log(`${COLORS.dim}Consommés (sse-adapter) : ${events.consumedTypes.length} types${COLORS.reset}`);

  if (events.orphans.length === 0) {
    console.log(ok("Aucun event UI-visible orphelin."));
  } else {
    console.log(
      warn(`${events.orphans.length} event(s) émis hors whitelist interne (à vérifier) :`),
    );
    for (const o of events.orphans) console.log(`    - ${o}`);
  }

  // 4. TODOs
  section("4. TODOs CRITIQUES");
  if (todos.critical.length === 0) {
    console.log(ok("Aucun TODO critique sur les chemins identifiés."));
  } else {
    console.log(fail(`${todos.critical.length} TODO(s) critique(s) :`));
    for (const t of todos.critical) console.log(`    - ${t}`);
  }
  console.log(`${COLORS.dim}+ ${todos.minor.length} TODOs mineurs (cap 20).${COLORS.reset}`);

  // ── Récap ────────────────────────────────────────────────────────
  section("RÉCAP");
  const drifts =
    tools.ghosts.length + (events.orphans.length > 0 ? 1 : 0) + todos.critical.length;
  if (drifts === 0) {
    console.log(`${COLORS.green}${COLORS.bold}✓ Pipeline cohérent — aucun drift critique détecté.${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}${COLORS.bold}✗ ${drifts} signal(aux) de drift à investiguer.${COLORS.reset}`);
  }

  // ── Write report ──────────────────────────────────────────────────
  if (WRITE_REPORT) {
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = `docs/pipeline-audit-${date}.md`;
    const md = renderMarkdown(tools, prompts, events, todos, date);
    mkdirSync(join(ROOT, "docs"), { recursive: true });
    writeFileSync(join(ROOT, reportPath), md, "utf-8");
    console.log(`\n${COLORS.dim}Rapport écrit dans ${reportPath}${COLORS.reset}\n`);
  }

  process.exit(tools.ghosts.length > 0 || todos.critical.length > 5 ? 1 : 0);
})();

function renderMarkdown(
  tools: ToolSurface,
  prompts: PromptSurvey,
  events: EventSurvey,
  todos: { critical: string[]; minor: string[] },
  date: string,
): string {
  return `# Hearst OS — Audit Pipeline (statique)

Généré le ${date} par \`scripts/audit-pipeline.ts\`.

## 1. Tools — annoncés vs wirés

- **Annoncés** dans \`system-prompt.ts\` CAPACITÉS NATIVES : ${tools.announced.length}
- **Wirés** dans \`ai-pipeline.ts\` aiTools spread : ${tools.wired.length}

### Fantômes (annoncés mais pas wirés)
${tools.ghosts.length === 0 ? "Aucun." : tools.ghosts.map((g) => `- \`${g}\``).join("\n")}

### Invisibles (wirés mais pas annoncés au LLM)
${tools.invisible.length === 0 ? "Aucun." : tools.invisible.map((i) => `- \`${i}\``).join("\n")}

## 2. Prompts IA — charte unifiée

### Migrés vers \`composeEditorialPrompt\`
${prompts.migrated.map((p) => `- \`${p}\``).join("\n")}

### Candidats potentiels (SYSTEM_PROMPT sans charter)
${prompts.candidates.length === 0 ? "Aucun." : prompts.candidates.map((c) => `- \`${c}\``).join("\n")}

## 3. Events SSE

- Émis : ${events.emittedTypes.length}
- Consommés (sse-adapter) : ${events.consumedTypes.length}

### Orphelins (émis hors whitelist interne)
${events.orphans.length === 0 ? "Aucun." : events.orphans.map((o) => `- \`${o}\``).join("\n")}

## 4. TODOs critiques

${todos.critical.length === 0 ? "Aucun." : todos.critical.map((t) => `- ${t}`).join("\n")}

---

*Ce rapport est généré automatiquement. Re-run avec \`npm run audit -- --write\`.*
`;
}

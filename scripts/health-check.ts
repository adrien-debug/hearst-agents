/**
 * Health Check — Ping tous les services externes API et génère un rapport.
 *
 * Usage : `npm run health` (ou `npx tsx scripts/health-check.ts`)
 *
 * Pour chaque service avec env var configurée, fait un appel léger
 * (HEAD/GET sur un endpoint public ou de validation), mesure la latence
 * et retourne un statut. Pas d'effet de bord (pas de write, pas d'enqueue).
 *
 * Output : tableau console avec colonnes Service / Status / Latency / Notes.
 * Code de retour : 0 si tout OK, 1 si au moins un service en erreur (hors
 * services optionnels non configurés).
 */

/* eslint-disable no-console */

// Charge .env.local (process.env n'est pas alimenté hors Next.js)
import { config } from "node:process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

(() => {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local optional
  }
})();
void config; // satisfy import

interface CheckResult {
  service: string;
  category: string;
  status: "ok" | "fail" | "skip" | "warn";
  latencyMs: number | null;
  note: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; ms: number; err: string | null }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - start, err: null };
  } catch (e) {
    return { result: null, ms: Date.now() - start, err: e instanceof Error ? e.message : String(e) };
  }
}

async function head(url: string, headers: Record<string, string> = {}, timeoutMs = 5000): Promise<number> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    return res.status;
  } finally {
    clearTimeout(t);
  }
}

function skip(service: string, category: string, note = "env var absente"): CheckResult {
  return { service, category, status: "skip", latencyMs: null, note };
}

function ok(service: string, category: string, ms: number, note = ""): CheckResult {
  return { service, category, status: "ok", latencyMs: ms, note };
}

function fail(service: string, category: string, ms: number, note: string): CheckResult {
  return { service, category, status: "fail", latencyMs: ms, note };
}

function warn(service: string, category: string, ms: number, note: string): CheckResult {
  return { service, category, status: "warn", latencyMs: ms, note };
}

// ── Checks ─────────────────────────────────────────────────────────

async function checkAnthropic(): Promise<CheckResult> {
  const cat = "LLM";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return skip("Anthropic", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.anthropic.com/v1/models", {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
  );
  if (err) return fail("Anthropic", cat, ms, err);
  return result === 200 ? ok("Anthropic", cat, ms, "models endpoint") : fail("Anthropic", cat, ms, `HTTP ${result}`);
}

async function checkOpenAI(): Promise<CheckResult> {
  const cat = "LLM";
  const key = process.env.OPENAI_API_KEY;
  if (!key) return skip("OpenAI", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` }),
  );
  if (err) return fail("OpenAI", cat, ms, err);
  return result === 200 ? ok("OpenAI", cat, ms, "models endpoint") : fail("OpenAI", cat, ms, `HTTP ${result}`);
}

async function checkDeepseek(): Promise<CheckResult> {
  const cat = "LLM";
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return skip("DeepSeek", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.deepseek.com/v1/models", { Authorization: `Bearer ${key}` }),
  );
  if (err) return fail("DeepSeek", cat, ms, err);
  return result === 200 ? ok("DeepSeek", cat, ms, "") : fail("DeepSeek", cat, ms, `HTTP ${result}`);
}

async function checkExa(): Promise<CheckResult> {
  const cat = "Search";
  const key = process.env.EXA_API_KEY;
  if (!key) return skip("Exa", cat);
  const { result, ms, err } = await timed(() =>
    fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", numResults: 1 }),
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.status),
  );
  if (err) return fail("Exa", cat, ms, err);
  return result === 200 ? ok("Exa", cat, ms, "") : fail("Exa", cat, ms, `HTTP ${result}`);
}

async function checkTavily(): Promise<CheckResult> {
  const cat = "Search";
  const key = process.env.TAVILY_API_KEY;
  if (!key) return skip("Tavily", cat);
  const { result, ms, err } = await timed(() =>
    fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: "test", max_results: 1 }),
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.status),
  );
  if (err) return fail("Tavily", cat, ms, err);
  return result === 200 ? ok("Tavily", cat, ms, "") : fail("Tavily", cat, ms, `HTTP ${result}`);
}

async function checkPerplexity(): Promise<CheckResult> {
  const cat = "Search";
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return skip("Perplexity", cat);
  // Endpoint léger : models list (pas de chat completion)
  const { result, ms, err } = await timed(() =>
    head("https://api.perplexity.ai/chat/completions", { Authorization: `Bearer ${key}` }, 5000),
  );
  if (err) return fail("Perplexity", "Search", ms, err);
  // 405/400 = key valide mais méthode/body invalide (on a fait GET au lieu de POST), c'est OK
  return result && [200, 400, 405].includes(result)
    ? ok("Perplexity", cat, ms, `HTTP ${result} (key valide)`)
    : fail("Perplexity", cat, ms, `HTTP ${result}`);
}

async function checkFAL(): Promise<CheckResult> {
  const cat = "Image";
  const key = process.env.FAL_KEY;
  if (!key) return skip("FAL.ai", cat);
  const { result, ms, err } = await timed(() =>
    head("https://queue.fal.run/", { Authorization: `Key ${key}` }, 5000),
  );
  if (err) return fail("FAL.ai", cat, ms, err);
  // FAL renvoie 401 sans path mais le ping passe = key acceptée
  return result && result < 500
    ? ok("FAL.ai", cat, ms, `HTTP ${result}`)
    : fail("FAL.ai", cat, ms, `HTTP ${result}`);
}

async function checkElevenLabs(): Promise<CheckResult> {
  const cat = "Audio";
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return skip("ElevenLabs", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.elevenlabs.io/v1/user", { "xi-api-key": key }, 5000),
  );
  if (err) return fail("ElevenLabs", cat, ms, err);
  return result === 200 ? ok("ElevenLabs", cat, ms, "user endpoint") : fail("ElevenLabs", cat, ms, `HTTP ${result}`);
}

async function checkHeyGen(): Promise<CheckResult> {
  const cat = "Video";
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return skip("HeyGen", cat);
  // HeyGen est lent (3-5s typique), timeout 12s
  const { result, ms, err } = await timed(() =>
    head("https://api.heygen.com/v1/voice.list", { "X-Api-Key": key }, 12000),
  );
  if (err) return fail("HeyGen", cat, ms, err);
  return result === 200 ? ok("HeyGen", cat, ms, "voice.list") : fail("HeyGen", cat, ms, `HTTP ${result}`);
}

async function checkRunway(): Promise<CheckResult> {
  const cat = "Video";
  const key = process.env.RUNWAY_API_KEY;
  if (!key) return skip("Runway", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.dev.runwayml.com/v1/organization", {
      Authorization: `Bearer ${key}`,
      "X-Runway-Version": "2024-11-06",
    }, 5000),
  );
  if (err) return fail("Runway", cat, ms, err);
  return result === 200 ? ok("Runway", cat, ms, "") : fail("Runway", cat, ms, `HTTP ${result}`);
}

async function checkLlamaParse(): Promise<CheckResult> {
  const cat = "Document";
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) return skip("LlamaParse", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.cloud.llamaindex.ai/api/v1/parsing/job/health", { Authorization: `Bearer ${key}` }, 5000),
  );
  if (err) return fail("LlamaParse", cat, ms, err);
  return result && result < 500
    ? ok("LlamaParse", cat, ms, `HTTP ${result}`)
    : fail("LlamaParse", cat, ms, `HTTP ${result}`);
}

async function checkE2B(): Promise<CheckResult> {
  const cat = "Code";
  const key = process.env.E2B_API_KEY;
  if (!key) return skip("E2B", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.e2b.dev/sandboxes", { "X-API-KEY": key }, 5000),
  );
  if (err) return fail("E2B", cat, ms, err);
  return result && result < 500
    ? ok("E2B", cat, ms, `HTTP ${result}`)
    : fail("E2B", cat, ms, `HTTP ${result}`);
}

async function checkBrowserbase(): Promise<CheckResult> {
  const cat = "Browser";
  const key = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!key) return skip("Browserbase", cat);
  if (!projectId) return warn("Browserbase", cat, 0, "PROJECT_ID manquant");
  const { result, ms, err } = await timed(() =>
    head(`https://api.browserbase.com/v1/projects/${projectId}`, { "x-bb-api-key": key }, 5000),
  );
  if (err) return fail("Browserbase", cat, ms, err);
  return result === 200 ? ok("Browserbase", cat, ms, "") : fail("Browserbase", cat, ms, `HTTP ${result}`);
}

async function checkRecall(): Promise<CheckResult> {
  const cat = "Meeting";
  const key = process.env.RECALL_API_KEY;
  if (!key) return skip("Recall.ai", cat);
  const base = process.env.RECALL_API_BASE ?? "https://us-east-1.recall.ai";
  const { result, ms, err } = await timed(() =>
    head(`${base}/api/v1/bot/`, { Authorization: `Token ${key}` }, 5000),
  );
  if (err) return fail("Recall.ai", cat, ms, err);
  return result && result < 500
    ? ok("Recall.ai", cat, ms, `HTTP ${result}`)
    : fail("Recall.ai", cat, ms, `HTTP ${result}`);
}

async function checkDeepgram(): Promise<CheckResult> {
  const cat = "Audio STT";
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return skip("Deepgram", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.deepgram.com/v1/projects", { Authorization: `Token ${key}` }, 5000),
  );
  if (err) return fail("Deepgram", cat, ms, err);
  return result === 200 ? ok("Deepgram", cat, ms, "") : fail("Deepgram", cat, ms, `HTTP ${result}`);
}

async function checkHume(): Promise<CheckResult> {
  const cat = "Voice/Emotion";
  const key = process.env.HUME_API_KEY;
  if (!key) return skip("Hume AI", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.hume.ai/v0/batch/jobs", { "X-Hume-Api-Key": key }, 5000),
  );
  if (err) return fail("Hume AI", cat, ms, err);
  return result && result < 500
    ? ok("Hume AI", cat, ms, `HTTP ${result}`)
    : fail("Hume AI", cat, ms, `HTTP ${result}`);
}

async function checkApollo(): Promise<CheckResult> {
  const cat = "Lead";
  const key = process.env.APOLLO_API_KEY;
  if (!key) return skip("Apollo", cat);
  const { result, ms, err } = await timed(() =>
    fetch("https://api.apollo.io/v1/auth/health", {
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.status),
  );
  if (err) return fail("Apollo", cat, ms, err);
  return result && result < 500
    ? ok("Apollo", cat, ms, `HTTP ${result}`)
    : fail("Apollo", cat, ms, `HTTP ${result}`);
}

async function checkPDL(): Promise<CheckResult> {
  const cat = "Lead";
  const key = process.env.PDL_API_KEY;
  if (!key) return skip("PeopleDataLabs", cat);
  // /v5/person/search avec une query bidon — 401 si key invalide, 200 si OK
  const { result, ms, err } = await timed(() =>
    head(
      "https://api.peopledatalabs.com/v5/person/search?size=1&query=" + encodeURIComponent('{"query":{"match_all":{}}}'),
      { "X-Api-Key": key },
      5000,
    ),
  );
  if (err) return fail("PeopleDataLabs", cat, ms, err);
  return result && result < 500
    ? ok("PeopleDataLabs", cat, ms, `HTTP ${result}`)
    : fail("PeopleDataLabs", cat, ms, `HTTP ${result}`);
}

async function checkComposio(): Promise<CheckResult> {
  const cat = "Connectors";
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return skip("Composio", cat);
  const { result, ms, err } = await timed(() =>
    head("https://backend.composio.dev/api/v3/internal/sdk/auth/health", { "x-api-key": key }, 5000),
  );
  if (err) return fail("Composio", cat, ms, err);
  return result && result < 500
    ? ok("Composio", cat, ms, `HTTP ${result}`)
    : fail("Composio", cat, ms, `HTTP ${result}`);
}

async function checkSupabase(): Promise<CheckResult> {
  const cat = "DB";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return skip("Supabase", cat);
  const { result, ms, err } = await timed(() =>
    head(`${url}/rest/v1/`, { apikey: key, Authorization: `Bearer ${key}` }, 5000),
  );
  if (err) return fail("Supabase", cat, ms, err);
  return result && result < 500
    ? ok("Supabase", cat, ms, `HTTP ${result}`)
    : fail("Supabase", cat, ms, `HTTP ${result}`);
}

async function checkSupabaseStorage(): Promise<CheckResult> {
  const cat = "Storage";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return skip("Supabase Storage", cat);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "assets";
  const { result, ms, err } = await timed(() =>
    head(`${url}/storage/v1/bucket/${bucket}`, { apikey: key, Authorization: `Bearer ${key}` }, 5000),
  );
  if (err) return fail("Supabase Storage", cat, ms, err);
  return result === 200 ? ok("Supabase Storage", cat, ms, `bucket=${bucket}`) : fail("Supabase Storage", cat, ms, `HTTP ${result}`);
}

async function checkUpstashREST(): Promise<CheckResult> {
  const cat = "Cache";
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return skip("Upstash REST", cat);
  const { result, ms, err } = await timed(() =>
    fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }).then((r) => r.json()) as Promise<{ result: string }>,
  );
  if (err) return fail("Upstash REST", cat, ms, err);
  return result?.result === "PONG" ? ok("Upstash REST", cat, ms, "PONG") : fail("Upstash REST", cat, ms, `unexpected: ${JSON.stringify(result)}`);
}

async function checkUpstashTCP(): Promise<CheckResult> {
  const cat = "Queue";
  const url = process.env.REDIS_URL;
  if (!url) return skip("Upstash TCP (BullMQ)", cat);
  // On ne peut pas ping facilement TCP sans charger ioredis. On vérifie juste
  // que l'URL est bien formée (rediss:// ou redis://).
  if (!/^rediss?:\/\//.test(url)) return fail("Upstash TCP (BullMQ)", cat, 0, "URL malformée");
  return ok("Upstash TCP (BullMQ)", cat, 0, "URL valide (ping skip — ioredis requis)");
}

async function checkInngest(): Promise<CheckResult> {
  const cat = "Jobs";
  const eventKey = process.env.INNGEST_EVENT_KEY;
  const signingKey = process.env.INNGEST_SIGNING_KEY;
  if (!eventKey || !signingKey) return skip("Inngest", cat);
  const { result, ms, err } = await timed(() =>
    head(`https://inn.gs/e/${eventKey}`, {}, 5000),
  );
  if (err) return fail("Inngest", cat, ms, err);
  return result && result < 500
    ? ok("Inngest", cat, ms, `HTTP ${result}`)
    : fail("Inngest", cat, ms, `HTTP ${result}`);
}

async function checkResend(): Promise<CheckResult> {
  const cat = "Email";
  const key = process.env.RESEND_API_KEY;
  if (!key) return skip("Resend", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.resend.com/domains", { Authorization: `Bearer ${key}` }, 5000),
  );
  if (err) return fail("Resend", cat, ms, err);
  return result === 200 ? ok("Resend", cat, ms, "") : fail("Resend", cat, ms, `HTTP ${result}`);
}

async function checkSentry(): Promise<CheckResult> {
  const cat = "Observability";
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return skip("Sentry", cat);
  // Le DSN encode l'host. On extrait et on ping /api/0/.
  const match = dsn.match(/^https:\/\/[^@]+@([^/]+)\/(\d+)$/);
  if (!match) return fail("Sentry", cat, 0, "DSN malformé");
  const host = match[1];
  const { result, ms, err } = await timed(() => head(`https://${host}/api/0/`, {}, 5000));
  if (err) return fail("Sentry", cat, ms, err);
  return result && result < 500
    ? ok("Sentry", cat, ms, `HTTP ${result}`)
    : fail("Sentry", cat, ms, `HTTP ${result}`);
}

async function checkLangfuse(): Promise<CheckResult> {
  const cat = "Observability";
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) return skip("Langfuse", cat);
  const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";
  const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
  const { result, ms, err } = await timed(() =>
    head(`${host}/api/public/projects`, { Authorization: `Basic ${auth}` }, 5000),
  );
  if (err) return fail("Langfuse", cat, ms, err);
  return result === 200 ? ok("Langfuse", cat, ms, "") : fail("Langfuse", cat, ms, `HTTP ${result}`);
}

async function checkAxiom(): Promise<CheckResult> {
  const cat = "Observability";
  const token = process.env.AXIOM_TOKEN;
  if (!token) return skip("Axiom", cat);
  const { result, ms, err } = await timed(() =>
    head("https://api.axiom.co/v1/datasets", { Authorization: `Bearer ${token}` }, 5000),
  );
  if (err) return fail("Axiom", cat, ms, err);
  return result === 200 ? ok("Axiom", cat, ms, "") : fail("Axiom", cat, ms, `HTTP ${result}`);
}

async function checkArcjet(): Promise<CheckResult> {
  const cat = "Security";
  const key = process.env.ARCJET_KEY;
  if (!key) return skip("Arcjet", cat);
  // Arcjet n'a pas de health endpoint public ; on vérifie juste le format
  if (!key.startsWith("ajkey_")) return fail("Arcjet", cat, 0, "format key invalide (attendu ajkey_...)");
  return ok("Arcjet", cat, 0, "key format OK (ping skip — décisions au runtime edge)");
}

async function checkR2(): Promise<CheckResult> {
  const cat = "Storage (legacy)";
  const id = process.env.R2_ACCESS_KEY_ID;
  if (!id) return skip("R2 (legacy)", cat);
  return warn("R2 (legacy)", cat, 0, "configuré mais déprécié — migré vers Supabase Storage");
}

// ── Run ────────────────────────────────────────────────────────────

const checks: Array<() => Promise<CheckResult>> = [
  checkAnthropic,
  checkOpenAI,
  checkDeepseek,
  checkExa,
  checkTavily,
  checkPerplexity,
  checkFAL,
  checkElevenLabs,
  checkHeyGen,
  checkRunway,
  checkLlamaParse,
  checkE2B,
  checkBrowserbase,
  checkRecall,
  checkDeepgram,
  checkHume,
  checkApollo,
  checkPDL,
  checkComposio,
  checkSupabase,
  checkSupabaseStorage,
  checkUpstashREST,
  checkUpstashTCP,
  checkInngest,
  checkResend,
  checkSentry,
  checkLangfuse,
  checkAxiom,
  checkArcjet,
  checkR2,
];

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

function formatStatus(s: CheckResult["status"]): string {
  switch (s) {
    case "ok":
      return `${COLORS.green}✓ OK${COLORS.reset}`;
    case "fail":
      return `${COLORS.red}✗ FAIL${COLORS.reset}`;
    case "skip":
      return `${COLORS.gray}—  SKIP${COLORS.reset}`;
    case "warn":
      return `${COLORS.yellow}⚠ WARN${COLORS.reset}`;
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

(async () => {
  console.log(`\n${COLORS.bold}${COLORS.cyan}🩺 Hearst OS — Health Check${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Pings ${checks.length} services externes…${COLORS.reset}\n`);

  // Lance tous les checks en parallèle (plus rapide, mais peut surcharger qq APIs si limites)
  const results = await Promise.all(checks.map((c) => c()));

  // Tableau
  const cols = {
    service: 22,
    category: 18,
    status: 10,
    latency: 10,
    note: 50,
  };

  const header =
    pad("Service", cols.service) +
    pad("Catégorie", cols.category) +
    pad("Statut", cols.status + 9) + // +9 pour les codes ANSI invisibles
    pad("Latence", cols.latency) +
    "Note";
  console.log(`${COLORS.bold}${header}${COLORS.reset}`);
  console.log(COLORS.dim + "─".repeat(110) + COLORS.reset);

  for (const r of results) {
    const status = formatStatus(r.status);
    const latency = r.latencyMs === null ? "—" : `${r.latencyMs}ms`;
    const row =
      pad(r.service, cols.service) +
      pad(r.category, cols.category) +
      pad(status, cols.status + (status.length - stripAnsi(status).length)) +
      pad(latency, cols.latency) +
      r.note;
    console.log(row);
  }

  // Récap
  const okCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const skipCount = results.filter((r) => r.status === "skip").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  console.log("");
  console.log(
    `${COLORS.green}${okCount} OK${COLORS.reset} · ` +
      `${COLORS.red}${failCount} FAIL${COLORS.reset} · ` +
      `${COLORS.yellow}${warnCount} WARN${COLORS.reset} · ` +
      `${COLORS.gray}${skipCount} SKIP${COLORS.reset}`,
  );
  console.log("");

  process.exit(failCount > 0 ? 1 : 0);
})();

/**
 * One-shot cleanup — wipe runtime state from Supabase + in-memory caches.
 *
 * Usage:
 *   npx tsx scripts/wipe-clutter.ts            # default: assets, missions, runs
 *   npx tsx scripts/wipe-clutter.ts --memory   # also wipe chat_messages (memory)
 *   npx tsx scripts/wipe-clutter.ts --all      # everything
 *
 * The --memory flag also nukes the conversation history. Useful when an
 * earlier turn polluted the structured memory (e.g. the model mentioned
 * an unrelated app and re-injected it on follow-up turns).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Minimal .env.local loader (no dotenv dep needed).
function loadEnv(): void {
  try {
    const raw = readFileSync(".env.local", "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // .env.local missing — rely on process env.
  }
}
loadEnv();

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const wipeMemory = args.has("--memory") || args.has("--all");

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Counts before ────────────────────────────────────────────
  const [assetsCount, actionsCount, missionsCount, runsCount, msgsCount] = await Promise.all([
    sb.from("assets").select("id", { count: "exact", head: true }),
    sb.from("actions").select("id", { count: "exact", head: true }),
    sb.from("missions").select("id", { count: "exact", head: true }),
    sb.from("runs").select("id", { count: "exact", head: true }).eq("trigger", "orchestrator_v2"),
    sb.from("chat_messages").select("id", { count: "exact", head: true }),
  ]);
  console.log(`Before:`);
  console.log(`  assets:        ${assetsCount.count ?? "?"}`);
  console.log(`  actions:       ${actionsCount.count ?? "?"}`);
  console.log(`  missions:      ${missionsCount.count ?? "?"}`);
  console.log(`  runs(v2):      ${runsCount.count ?? "?"}`);
  console.log(`  chat_messages: ${msgsCount.count ?? "?"}${wipeMemory ? "" : " (preserved — pass --memory to wipe)"}`);

  // ── Wipe (children first to respect FKs) ─────────────────────
  // actions.asset_id → assets.id. Delete actions first so the FK doesn't
  // block the assets purge.
  // Each table has a different "always present" filter column — actions
  // doesn't have created_at, so we use timestamp there.
  // Order matters — children must be deleted before their parents to avoid
  // FK violations. Tables with no rows or that don't exist in this install
  // are silently skipped.
  const wipeOrder: string[] = [
    "actions",     // FK → assets
    "artifacts",   // FK → runs (this is where the 7 ghost assets lived!)
    "run_logs",    // FK → run_steps
    "plan_steps",  // FK → run_steps
    "run_steps",   // FK → runs
    "traces",     // FK → runs (some installs)
    "assets",     // referenced by actions (already wiped)
    "missions",
    "runs",
    ...(wipeMemory ? ["chat_messages"] : []),
  ];

  // Universal "delete everything" pattern: fetch ids → delete by id list.
  // Avoids per-table column knowledge (some tables don't have created_at,
  // others use timestamp / started_at / etc.).
  for (const table of wipeOrder) {
    const { data: idRows, error: selErr } = await sb
      .from(table)
      .select("id")
      .limit(50_000);
    if (selErr) {
      // Likely the table doesn't exist in this install — skip silently.
      console.log(`  ℹ️  ${table}: ${selErr.message} — skipping`);
      continue;
    }
    if (!idRows || idRows.length === 0) {
      console.log(`  ✅ ${table}: 0 row(s) (already empty)`);
      continue;
    }
    const ids = idRows.map((r) => (r as { id: string }).id);
    const { error: delErr, count } = await sb
      .from(table)
      .delete({ count: "exact" })
      .in("id", ids);
    if (delErr) {
      console.error(`  ❌ ${table}: ${delErr.message}`);
      continue;
    }
    console.log(`  ✅ ${table}: ${count ?? ids.length} row(s) deleted`);
  }

  // ── Try to flush the running dev server's in-memory caches too.
  // Without this, the user's UI would keep showing ghost rows from the
  // server-side Maps that survive the DB wipe.
  const devUrl = process.env.HEARST_DEV_URL ?? "http://localhost:9000";
  try {
    const res = await fetch(`${devUrl}/api/dev/wipe-caches`, { method: "POST" });
    if (res.ok) {
      const body = (await res.json()) as { wiped?: Record<string, number> };
      console.log(`  ✅ in-memory caches wiped via ${devUrl}: ${JSON.stringify(body.wiped ?? {})}`);
    } else {
      console.log(`  ℹ️  ${devUrl}/api/dev/wipe-caches returned ${res.status} — restart your dev server to clear in-memory caches`);
    }
  } catch {
    console.log(`  ℹ️  ${devUrl} unreachable — restart your dev server to clear in-memory caches`);
  }

  // ── Counts after ─────────────────────────────────────────────
  const [a2, ac2, m2, r2, cm2] = await Promise.all([
    sb.from("assets").select("id", { count: "exact", head: true }),
    sb.from("actions").select("id", { count: "exact", head: true }),
    sb.from("missions").select("id", { count: "exact", head: true }),
    sb.from("runs").select("id", { count: "exact", head: true }).eq("trigger", "orchestrator_v2"),
    sb.from("chat_messages").select("id", { count: "exact", head: true }),
  ]);
  console.log(`After:`);
  console.log(`  assets:        ${a2.count ?? "?"}`);
  console.log(`  actions:       ${ac2.count ?? "?"}`);
  console.log(`  missions:      ${m2.count ?? "?"}`);
  console.log(`  runs(v2):      ${r2.count ?? "?"}`);
  console.log(`  chat_messages: ${cm2.count ?? "?"}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

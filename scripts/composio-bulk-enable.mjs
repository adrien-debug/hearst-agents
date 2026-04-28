/**
 * Composio Bulk Enable — Managed Auth pour tous les toolkits compatibles.
 *
 * Itère sur le catalogue Composio et tente, pour chaque toolkit, de créer
 * une auth-config "use_composio_managed_auth". Skip ceux qui ont déjà une
 * auth-config managed active. Log les échecs (toolkits qui demandent du
 * Custom OAuth, key API, etc.) sans bloquer.
 *
 * Usage :
 *   npm run composio:enable-all
 *   npm run composio:enable-all -- --verbose       # log les "already"
 *   npm run composio:enable-all -- --dry           # n'écrit rien, simule
 *   npm run composio:enable-all -- --category=crm  # filtre une catégorie
 *
 * Idempotent : peut être relancé librement, ne re-crée pas les configs
 * existantes. À relancer périodiquement quand Composio ajoute de nouveaux
 * toolkits managed.
 */

import { Composio } from "@composio/core";

// Lecture flags CLI ----------------------------------------------------------
const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose");
const DRY_RUN = args.includes("--dry");
const CATEGORY_ARG = args.find((a) => a.startsWith("--category="));
const CATEGORY = CATEGORY_ARG ? CATEGORY_ARG.split("=")[1] : null;

// Petit utilitaire : sleep entre les requêtes pour ne pas saturer Composio.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PER_TOOLKIT_DELAY_MS = 50;

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("✗ COMPOSIO_API_KEY missing — set it in .env.local");
    process.exit(1);
  }

  const composio = new Composio({ apiKey });

  // Étape 1 — récupérer tous les toolkits.
  // Le SDK v0.6 a un bug : toolkits.get() retourne max 100 items et perd
  // le next_cursor dans transformToolkitListResponse. On contourne en
  // tapant le raw OpenAPI client (.client.toolkits.list) qui retourne la
  // réponse complète avec next_cursor.
  console.log("→ Fetching toolkits catalog (raw paginated client)…");
  const allToolkits = [];
  let cursor = undefined;
  let page = 0;
  const rawClient = composio.client?.toolkits;
  if (!rawClient || typeof rawClient.list !== "function") {
    console.error("✗ Le SDK n'expose pas composio.client.toolkits.list — impossible de paginer.");
    process.exit(1);
  }
  do {
    page++;
    const query = { limit: 100 };
    if (cursor) query.cursor = cursor;
    if (CATEGORY) query.category = CATEGORY;
    const resp = await rawClient.list(query);
    const items = resp?.items ?? [];
    allToolkits.push(...items);
    cursor = resp?.next_cursor ?? resp?.nextCursor ?? null;
    process.stdout.write(`  page ${page} (${items.length} items, total ${allToolkits.length})\r`);
    if (!items.length) break;
  } while (cursor);
  console.log(`\n✓ Got ${allToolkits.length} toolkits${CATEGORY ? ` in category=${CATEGORY}` : ""}.`);
  console.log(`${DRY_RUN ? "(dry-run mode — nothing will be written)" : ""}\n`);

  // Étape 2 — pour chaque toolkit, vérifier puis créer la managed auth-config.
  let activated = 0;
  let alreadyConfigured = 0;
  const failed = [];

  for (const t of allToolkits) {
    const slug = t?.slug ?? t?.toolkitSlug ?? null;
    if (!slug) {
      failed.push({ slug: "(unknown)", msg: "missing slug in toolkit response" });
      continue;
    }

    try {
      // Check existante (managed) — ne pas écraser
      const existing = await composio.authConfigs.list({
        toolkit: slug,
        isComposioManaged: true,
        limit: 1,
      });
      const existingItems = existing?.items ?? [];
      if (existingItems.length > 0) {
        alreadyConfigured++;
        if (VERBOSE) console.log(`· ${slug.padEnd(32)} already configured`);
        await sleep(PER_TOOLKIT_DELAY_MS);
        continue;
      }

      if (DRY_RUN) {
        console.log(`→ ${slug.padEnd(32)} would create managed auth`);
        await sleep(PER_TOOLKIT_DELAY_MS);
        continue;
      }

      // Create managed
      await composio.authConfigs.create(slug, {
        type: "use_composio_managed_auth",
      });
      activated++;
      console.log(`✓ ${slug.padEnd(32)} activated`);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      failed.push({ slug, msg });
      // Première ligne du message pour rester lisible — Composio renvoie
      // parfois des stacktraces verbeuses.
      const short = msg.split("\n")[0].slice(0, 70);
      console.log(`× ${slug.padEnd(32)} ${short}`);
    }

    await sleep(PER_TOOLKIT_DELAY_MS);
  }

  // Étape 3 — récapitulatif. Group les raisons d'échec pour rapidement
  // identifier les patterns (ex: "Custom OAuth required" vs "no auth scheme").
  console.log("\n=== Summary ===");
  console.log(`Activated         : ${activated}`);
  console.log(`Already managed   : ${alreadyConfigured}`);
  console.log(`Skipped / failed  : ${failed.length}`);
  console.log(`Total scanned     : ${allToolkits.length}`);

  if (failed.length > 0) {
    const byReason = new Map();
    for (const f of failed) {
      // On groupe par le 1er bout du message — assez pour distinguer
      // "Custom OAuth" de "Toolkit not found" de "rate limited".
      const key = f.msg.split(/[:.\n]/)[0].slice(0, 70).trim();
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    console.log("\nTop failure reasons:");
    const sorted = [...byReason].sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted.slice(0, 8)) {
      console.log(`  ${String(count).padStart(4)} × ${reason}`);
    }
    if (sorted.length > 8) {
      console.log(`  …${sorted.length - 8} other reason(s)`);
    }

    if (VERBOSE) {
      console.log("\nFull failure list:");
      for (const f of failed) {
        console.log(`  ${f.slug.padEnd(32)} ${f.msg.slice(0, 100)}`);
      }
    } else {
      console.log("\nRun with --verbose to see the full failure list.");
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

/**
 * Backfill embeddings pour kg_nodes existants (one-shot).
 *
 * Le pipeline kg-ingest auto-embed les nouveaux nodes désormais (cf. tâche
 * 2.1). Pour les nodes ingérés AVANT cette feature, ce script scan tous les
 * nodes et appelle upsertEmbedding pour chacun. Idempotent (UNIQUE KEY sur
 * (user_id, tenant_id, source_kind, source_id) — re-run safe).
 *
 * Rate limit : 50ms entre upserts pour rester sous la limite OpenAI
 * (3000 RPM en text-embedding-3-small). Pour ~5000 nodes, durée ~4min.
 *
 * Usage : `npx tsx scripts/backfill-kg-embeddings.ts`
 */

/* eslint-disable no-console */

import { loadEnv } from "./lib/load-env";

loadEnv();

import { createClient } from "@supabase/supabase-js";
import { upsertEmbedding } from "@/lib/embeddings/store";
import { buildNodeExcerpt } from "@/lib/memory/kg-excerpt";

interface KgNodeRow {
  id: string;
  user_id: string;
  tenant_id: string;
  type: string;
  label: string;
  properties: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  console.log("🔁 Hearst OS — KG embeddings backfill\n");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY manquant — embeddings impossibles");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const BATCH = 100;
  let offset = 0;
  let total = 0;
  let succeeded = 0;
  let failed = 0;

  while (true) {
    const { data, error } = await sb
      .from("kg_nodes")
      .select("id, user_id, tenant_id, type, label, properties")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("Fetch batch failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const node of data as KgNodeRow[]) {
      total++;
      const excerpt = buildNodeExcerpt(node);
      const ok = await upsertEmbedding({
        userId: node.user_id,
        tenantId: node.tenant_id,
        sourceKind: "kg_node",
        sourceId: node.id,
        textExcerpt: excerpt,
        metadata: { type: node.type, label: node.label },
      });
      if (ok) {
        succeeded++;
      } else {
        failed++;
        console.warn(`✗  ${node.label} (${node.id.slice(0, 8)}) — upsertEmbedding returned false`);
      }
      // Rate limit : 50ms entre upserts pour rester sous OpenAI 3000 RPM
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log(`Batch ${offset}-${offset + data.length} processed (${succeeded}/${total})`);
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`\n${succeeded}/${total} embeddings upserts réussis · ${failed} échecs`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});

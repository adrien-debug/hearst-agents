#!/usr/bin/env ts-node
/**
 * Migration Script — Local Assets → R2/Hybrid Storage
 *
 * Usage:
 *   npx ts-node scripts/migrate-assets.ts --provider=r2 --dry-run
 *   npx ts-node scripts/migrate-assets.ts --provider=r2 --execute
 */

import { LocalStorageProvider, R2StorageProvider } from "../lib/engine/runtime/assets/storage";
import fs from "fs/promises";
import path from "path";

interface MigrationOptions {
  sourcePath: string;
  provider: "r2" | "hybrid";
  dryRun: boolean;
  batchSize: number;
  tenantId?: string;
}

async function migrateAssets(options: MigrationOptions) {
  console.log("\n🚀 Asset Migration Tool");
  console.log("=======================\n");
  console.log(`Source: ${options.sourcePath}`);
  console.log(`Target: ${options.provider}`);
  console.log(`Mode: ${options.dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`Batch size: ${options.batchSize}\n`);

  // Initialize source (local)
  const source = new LocalStorageProvider({
    basePath: options.sourcePath,
    publicBaseUrl: "http://localhost:9000/assets",
  });

  // Initialize target
  let target: R2StorageProvider;
  if (options.provider === "r2") {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      console.error("❌ Missing R2 environment variables:");
      console.error("  - R2_ACCOUNT_ID");
      console.error("  - R2_ACCESS_KEY_ID");
      console.error("  - R2_SECRET_ACCESS_KEY");
      console.error("  - R2_BUCKET");
      console.error("  - R2_PUBLIC_URL");
      process.exit(1);
    }

    target = new R2StorageProvider({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicUrl,
    });
  } else {
    console.error("❌ Hybrid migration not yet implemented");
    process.exit(1);
  }

  // Health check
  console.log("Checking source health...");
  const sourceHealth = await source.health();
  if (!sourceHealth.ok) {
    console.error(`❌ Source unhealthy: ${sourceHealth.error}`);
    process.exit(1);
  }
  console.log(`✅ Source OK (${sourceHealth.latencyMs}ms)\n`);

  console.log("Checking target health...");
  const targetHealth = await target.health();
  if (!targetHealth.ok) {
    console.error(`❌ Target unhealthy: ${targetHealth.error}`);
    process.exit(1);
  }
  console.log(`✅ Target OK (${targetHealth.latencyMs}ms)\n`);

  // List all files
  console.log("Scanning source files...");
  const files = await listAllFiles(source, "", options.tenantId);
  console.log(`Found ${files.length} files\n`);

  if (files.length === 0) {
    console.log("No files to migrate. Exiting.");
    return;
  }

  // Calculate total size
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);

  if (options.dryRun) {
    console.log("🔍 DRY RUN — Would migrate:\n");
    for (const file of files.slice(0, 10)) {
      console.log(`  → ${file.key} (${(file.size / 1024).toFixed(1)} KB)`);
    }
    if (files.length > 10) {
      console.log(`  ... and ${files.length - 10} more files`);
    }
    console.log("\n✅ Dry run complete. Use --execute to migrate.");
    return;
  }

  // Execute migration
  console.log("🚀 Starting migration...\n");

  let migrated = 0;
  let failed = 0;
  let totalBytes = 0;

  for (let i = 0; i < files.length; i += options.batchSize) {
    const batch = files.slice(i, i + options.batchSize);
    console.log(`Batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(files.length / options.batchSize)} (${batch.length} files)`);

    await Promise.all(
      batch.map(async (file) => {
        try {
          // Download from source
          const download = await source.download(file.key, options.tenantId);
          const reader = download.stream.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

          // Upload to target
          await target.upload(
            file.key,
            buffer,
            {
              contentType: download.contentType,
              metadata: {},
              tenantId: options.tenantId,
            }
          );

          migrated++;
          totalBytes += file.size;
          process.stdout.write(".");
        } catch (err) {
          failed++;
          console.error(`\n❌ Failed: ${file.key} — ${err}`);
        }
      })
    );
    console.log("");
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`  Migrated: ${migrated} files`);
  console.log(`  Failed: ${failed} files`);
  console.log(`  Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

async function listAllFiles(
  storage: LocalStorageProvider,
  prefix: string,
  tenantId?: string
): Promise<Array<{ key: string; size: number }>> {
  const files: Array<{ key: string; size: number }> = [];

  const list = await storage.list(prefix, tenantId);
  for (const obj of list) {
    files.push({ key: obj.key, size: obj.size });
  }

  return files;
}

// CLI
const args = process.argv.slice(2);
const options: MigrationOptions = {
  sourcePath: ".runtime-assets",
  provider: "r2",
  dryRun: true,
  batchSize: 10,
  tenantId: undefined,
};

for (const arg of args) {
  if (arg === "--execute") options.dryRun = false;
  if (arg === "--provider=r2") options.provider = "r2";
  if (arg === "--provider=hybrid") options.provider = "hybrid";
  if (arg.startsWith("--source=")) options.sourcePath = arg.replace("--source=", "");
  if (arg.startsWith("--tenant=")) options.tenantId = arg.replace("--tenant=", "");
  if (arg.startsWith("--batch=")) options.batchSize = parseInt(arg.replace("--batch=", ""), 10);
}

migrateAssets(options).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

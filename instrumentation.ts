/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * Primary bootstrap point for:
 * 1. Global storage (R2 en prod, hybrid local+R2 en dev avec clés, local sinon)
 * 2. Mission scheduler (orchestration engine)
 * 3. Asset cleanup scheduler (garbage collection)
 * 4. BullMQ workers Phase B (audio-gen, image-gen, video-gen, etc.)
 *
 * The /api/orchestrate module-scope call remains as a secondary guard.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Storage — doit être initialisé avant les workers et le cleanup.
    const { initGlobalStorage } = await import(
      "@/lib/engine/runtime/assets/storage"
    );

    const r2Keys =
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL;

    if (r2Keys) {
      const isProd = process.env.NODE_ENV === "production";
      initGlobalStorage({
        provider: isProd ? "r2" : "hybrid",
        local: {
          basePath: ".runtime-assets",
          publicBaseUrl: "http://localhost:9000/assets",
        },
        r2: {
          accountId: process.env.R2_ACCOUNT_ID!,
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          bucket: process.env.R2_BUCKET!,
          publicUrl: process.env.R2_PUBLIC_URL!,
        },
        ...(isProd
          ? {}
          : {
              hybrid: {
                hotProvider: "local" as const,
                coldProvider: "r2" as const,
                maxHotSizeBytes: 50 * 1024 * 1024,
                maxHotFiles: 500,
                ttlSeconds: 3600,
              },
            }),
      });
      console.info(`[Storage] Initialized — ${isProd ? "r2" : "hybrid (local+r2)"}`);
    } else {
      // Dev sans clés R2 — getGlobalStorage() tombera sur le fallback local
      console.info("[Storage] R2 keys absent — using local dev storage");
    }

    // 2. Mission scheduler
    const { ensureSchedulerStarted } = await import(
      "@/lib/engine/runtime/missions/scheduler-init"
    );
    await ensureSchedulerStarted();

    // 3. Asset cleanup scheduler
    const { ensureCleanupSchedulerStarted } = await import(
      "@/lib/engine/runtime/assets/cleanup/boot"
    );
    await ensureCleanupSchedulerStarted();

    // 4. BullMQ workers — audio-gen et suivants. Sans REDIS_URL, no-op.
    const { startAllWorkers } = await import("@/lib/jobs/workers");
    startAllWorkers();
  }
}

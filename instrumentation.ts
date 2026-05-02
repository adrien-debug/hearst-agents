/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * Primary bootstrap point for:
 * 0. Sentry init (server + edge runtimes, gated on SENTRY_DSN)
 * 1. Global storage (R2 en prod, hybrid local+R2 en dev avec clés, local sinon)
 * 2. Mission scheduler (orchestration engine)
 * 3. Asset cleanup scheduler (garbage collection)
 * 4. BullMQ workers Phase B (audio-gen, image-gen, video-gen, etc.) — gated off sur Vercel
 *
 * The /api/orchestrate module-scope call remains as a secondary guard.
 */

import * as Sentry from "@sentry/nextjs";

// Capture toutes les server request errors automatiquement (Next.js 15+, @sentry/nextjs >=8.28.0)
export const onRequestError = Sentry.captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.SENTRY_DSN) {
      await import("./sentry.server.config");
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    if (process.env.SENTRY_DSN) {
      await import("./sentry.edge.config");
    }
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Storage — doit être initialisé avant les workers et le cleanup.
    // Priorité : Supabase Storage (serverless-friendly, pas d'AWS SDK).
    // Fallback historique : R2 (S3-compatible) si configuré.
    const { initGlobalStorage } = await import(
      "@/lib/engine/runtime/assets/storage"
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "assets";

    const r2Keys =
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL;

    if (supabaseUrl && supabaseKey) {
      initGlobalStorage({
        provider: "supabase",
        supabase: {
          url: supabaseUrl,
          serviceRoleKey: supabaseKey,
          bucket: supabaseBucket,
        },
      });
      console.info(`[Storage] Initialized — supabase (bucket: ${supabaseBucket})`);
    } else if (r2Keys) {
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
      console.info(`[Storage] Initialized — ${isProd ? "r2" : "hybrid (local+r2)"} (legacy fallback)`);
    } else {
      console.info("[Storage] No backend configured — using local dev storage");
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
    // Sur Vercel serverless, les workers ne peuvent pas tourner en arrière-plan :
    // chaque invocation lambda meurt à la fin de la requête. Les jobs restent
    // dans la queue Redis sans être consommés. À déplacer vers Inngest (cf. plan migration).
    if (process.env.VERCEL !== "1") {
      const { startAllWorkers } = await import("@/lib/jobs/workers");
      startAllWorkers();
    } else {
      console.info("[Workers] Vercel detected — workers disabled (use Inngest for async jobs)");
    }
  }
}

/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * Primary bootstrap point for:
 * 1. Mission scheduler (orchestration engine)
 * 2. Asset cleanup scheduler (garbage collection)
 * 3. BullMQ workers Phase B (audio-gen, image-gen, video-gen, etc.)
 *
 * The /api/orchestrate module-scope call remains as a secondary guard.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchedulerStarted } = await import(
      "@/lib/engine/runtime/missions/scheduler-init"
    );
    await ensureSchedulerStarted();

    const { ensureCleanupSchedulerStarted } = await import(
      "@/lib/engine/runtime/assets/cleanup/boot"
    );
    await ensureCleanupSchedulerStarted();

    // Phase B workers — audio-gen et suivants. Sans REDIS_URL, no-op.
    const { startAllWorkers } = await import("@/lib/jobs/workers");
    startAllWorkers();
  }
}

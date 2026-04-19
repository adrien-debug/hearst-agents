/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * Primary bootstrap point for the mission scheduler so it starts
 * without requiring any API traffic. The /api/orchestrate module-scope
 * call remains as a secondary guard.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchedulerStarted } = await import(
      "@/lib/runtime/missions/scheduler-init"
    );
    await ensureSchedulerStarted();
  }
}

import CanvasShell from "./_canvas/CanvasShell";

export const dynamic = "force-dynamic";

/**
 * Admin landing — live pipeline canvas.
 *
 * Replaces the previous Command Center stats grid. The canvas visualises the
 * orchestration pipeline (lib/engine/orchestrator/index.ts) in real time:
 * nodes light up as events fire, edges pulse on tool calls, runs can be
 * replayed from history.
 *
 * Server component is intentionally minimal — all the data fetching happens
 * client-side via the canvas hooks (useEventStream, useReplay, RunRail).
 */
export default function AdminLandingPage() {
  return <CanvasShell />;
}

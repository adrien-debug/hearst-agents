/**
 * SSE Adapter — Transforms internal RunEvents to SSE for the UI.
 *
 * Not all internal events are exposed to the client.
 * This adapter filters and maps them to a client-friendly format.
 */

import type { RunEventBus } from "../bus";
import type { RunEvent } from "../types";

export class SSEAdapter {
  private controller: ReadableStreamDefaultController | null = null;
  private cleanup: (() => void) | null = null;
  private encoder = new TextEncoder();

  constructor(private bus: RunEventBus) {
    this.cleanup = bus.on((event) => this.handleEvent(event));
  }

  pipe(controller: ReadableStreamDefaultController): void {
    this.controller = controller;
  }

  close(): void {
    this.cleanup?.();
    try {
      this.controller?.close();
    } catch {
      // already closed
    }
    this.controller = null;
  }

  sendError(err: unknown): void {
    const msg = err instanceof Error ? err.message : "Unknown error";
    this.send({ type: "run_failed", error: msg });
  }

  private handleEvent(event: RunEvent): void {
    const sse = this.toSSE(event);
    if (sse) this.send(sse);
  }

  private send(data: Record<string, unknown>): void {
    if (!this.controller) return;
    try {
      this.controller.enqueue(
        this.encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      // stream closed
    }
  }

  /**
   * Filter and map internal events to client-facing SSE events.
   * Returns null for events that should not be exposed to the UI.
   *
   * Principle: every user-visible state change must produce an SSE event.
   * Internal bookkeeping (cost, retries, delegate internals) stays hidden.
   */
  private toSSE(event: RunEvent): Record<string, unknown> | null {
    switch (event.type) {
      // ── Run lifecycle (visible) ──────────────────────────
      case "run_started":
        return { type: "run_started", run_id: event.run_id };
      case "run_completed":
        return {
          type: "run_completed",
          run_id: event.run_id,
          artifacts: event.artifacts,
        };
      case "run_failed":
        return { type: "run_failed", error: event.error };
      case "run_suspended":
        return {
          type: "run_suspended",
          run_id: event.run_id,
          reason: event.reason,
        };
      case "run_resumed":
        return { type: "run_resumed", run_id: event.run_id };

      // ── Plan (visible — user sees "planning X steps") ────
      case "plan_attached":
        return {
          type: "plan_attached",
          plan_id: event.plan_id,
          step_count: event.step_count,
        };

      // ── Steps (visible — user sees timeline) ─────────────
      case "step_started":
        return {
          type: "step_started",
          step_id: event.step_id,
          agent: event.agent,
          title: event.title,
        };
      case "step_completed":
        return { type: "step_completed", step_id: event.step_id };
      case "step_failed":
        return {
          type: "step_failed",
          step_id: event.step_id,
          error: event.error,
        };

      // ── Tool calls (visible — user sees "calling X") ─────
      case "tool_call_started":
        return {
          type: "tool_call_started",
          step_id: event.step_id,
          tool: event.tool,
        };
      case "tool_call_completed":
        return {
          type: "tool_call_completed",
          step_id: event.step_id,
          tool: event.tool,
        };

      // ── Text streaming ───────────────────────────────────
      case "text_delta":
        return { type: "text_delta", delta: event.delta };

      // ── Approvals (visible — user must act) ──────────────
      case "approval_requested":
        return {
          type: "approval_requested",
          approval_id: event.approval_id,
          step_id: event.step_id,
        };
      case "action_plan_proposed":
        return {
          type: "action_plan_proposed",
          action_plan_id: event.action_plan_id,
          summary: event.summary,
          action_count: event.action_count,
        };

      // ── Artifacts (visible — user sees document) ─────────
      case "artifact_created":
        return {
          type: "artifact_created",
          artifact_id: event.artifact_id,
          artifact_type: event.artifact_type,
          title: event.title,
        };
      case "artifact_revised":
        return {
          type: "artifact_revised",
          artifact_id: event.artifact_id,
          version: event.version,
        };

      // ── Clarification (visible — user must respond) ──────
      case "clarification_requested":
        return {
          type: "clarification_requested",
          question: event.question,
          options: event.options,
        };

      // ── Scheduled missions (visible — user sees automation) ─
      case "scheduled_mission_created":
        return {
          type: "scheduled_mission_created",
          mission_id: event.mission_id,
          name: event.name,
          schedule: event.schedule,
        };
      case "scheduled_mission_triggered":
        return {
          type: "scheduled_mission_triggered",
          mission_id: event.mission_id,
          name: event.name,
        };

      // ── Assets (visible — user sees deliverable) ──────────
      case "asset_generated":
        return {
          type: "asset_generated",
          asset_id: event.asset_id,
          asset_type: event.asset_type,
          name: event.name,
          url: event.url,
        };

      // ── Agent selection (visible — user sees which agent) ──
      case "agent_selected":
        return {
          type: "agent_selected",
          agent_id: event.agent_id,
          agent_name: event.agent_name,
          backend: event.backend,
          backend_reason: event.backend_reason,
        };

      // ── Tool surface (visible — UI renders tool palette) ──
      case "tool_surface":
        return {
          type: "tool_surface",
          context: event.context,
          tools: event.tools,
        };

      // ── Execution mode (visible — user sees routing) ─────
      case "execution_mode_selected":
        return {
          type: "execution_mode_selected",
          mode: event.mode,
          reason: event.reason,
          backend: event.backend,
        };

      // ── Orchestrator log (visible — activity feed) ───────
      case "orchestrator_log":
        return {
          type: "orchestrator_log",
          message: event.message,
        };

      // ── Capability blocked (visible — user needs to act) ──
      case "capability_blocked":
        return {
          type: "capability_blocked",
          capability: event.capability,
          requiredProviders: event.requiredProviders,
          message: event.message,
        };

      // ── Internal events NOT exposed to the UI ────────────
      case "run_created":
      case "run_cancelled":
      case "step_retrying":
      case "delegate_enqueued":
      case "delegate_completed":
      case "approval_decided":
      case "cost_updated":
      case "retrieval_mode_inferred":
      case "runtime_warning":
      case "operator_violation":
        return null;
    }
  }
}

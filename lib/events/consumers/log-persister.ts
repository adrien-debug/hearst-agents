/**
 * Log Persister — Persists important RunEvents to run_logs table.
 *
 * Not every event is persisted — only errors, warnings, approvals,
 * violations, and mode inferences (for observability).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEventBus } from "../bus";
import type { RunEvent } from "../types";

interface LogEntry {
  run_id: string;
  step_id?: string;
  at: string;
  level: "info" | "warning" | "error";
  actor: string;
  message: string;
}

export class LogPersister {
  constructor(private db: SupabaseClient) {}

  attach(bus: RunEventBus): () => void {
    return bus.on(async (event) => {
      const entry = this.toLog(event);
      if (entry) {
        const { error } = await this.db.from("run_logs").insert(entry);
        if (error) {
          console.error("[LogPersister] insert error:", error.message);
        }
      }
    });
  }

  private toLog(event: RunEvent): LogEntry | null {
    switch (event.type) {
      case "step_failed":
        return {
          run_id: event.run_id,
          step_id: event.step_id,
          at: event.timestamp,
          level: "error",
          actor: "runtime",
          message: event.error,
        };
      case "step_retrying":
        return {
          run_id: event.run_id,
          step_id: event.step_id,
          at: event.timestamp,
          level: "warning",
          actor: "runtime",
          message: `Retry attempt ${event.attempt}`,
        };
      case "approval_requested":
        return {
          run_id: event.run_id,
          step_id: event.step_id,
          at: event.timestamp,
          level: "info",
          actor: "runtime",
          message: `Approval requested: ${event.approval_id}`,
        };
      case "approval_decided":
        return {
          run_id: event.run_id,
          at: event.timestamp,
          level: "info",
          actor: "runtime",
          message: `Approval ${event.approval_id}: ${event.decision}`,
        };
      case "run_failed":
        return {
          run_id: event.run_id,
          at: event.timestamp,
          level: "error",
          actor: "runtime",
          message: event.error,
        };
      case "retrieval_mode_inferred":
        return {
          run_id: event.run_id,
          step_id: event.step_id,
          at: event.timestamp,
          level: "warning",
          actor: "runtime",
          message: `Retrieval mode inferred: ${event.inferred_mode} (task: "${event.task.slice(0, 80)}")`,
        };
      case "runtime_warning":
        return {
          run_id: event.run_id,
          at: event.timestamp,
          level: "warning",
          actor: "runtime",
          message: event.message,
        };
      case "operator_violation":
        return {
          run_id: event.run_id,
          step_id: event.step_id,
          at: event.timestamp,
          level: "error",
          actor: "Operator",
          message: `VIOLATION on ${event.tool}: ${event.violation}`,
        };
      default:
        return null;
    }
  }
}

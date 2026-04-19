/**
 * Approval Manager — CRUD + decisions for RunApprovals.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunApproval, CreateApprovalInput } from "./types";
import type { RunEventBus } from "../../events/bus";

const DEFAULT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export class ApprovalManager {
  constructor(
    private db: SupabaseClient,
    private runId: string,
    private events: RunEventBus,
  ) {}

  async create(input: CreateApprovalInput): Promise<RunApproval> {
    const { data, error } = await this.db
      .from("run_approvals")
      .insert({
        run_id: this.runId,
        step_id: input.step_id,
        status: "pending" as const,
        kind: input.kind,
        summary: input.summary,
        proposed_action: input.proposed_action,
        reversible: input.reversible,
        expires_at: new Date(Date.now() + DEFAULT_EXPIRY_MS).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[ApprovalManager] create error:", error.message);
      throw new Error(`Failed to create approval: ${error.message}`);
    }

    this.events.emit({
      type: "approval_requested",
      run_id: this.runId,
      step_id: input.step_id,
      approval_id: data!.id,
    });

    return data as RunApproval;
  }

  async decide(
    approvalId: string,
    decision: "approved" | "rejected",
    decidedBy: string,
  ): Promise<void> {
    const { error } = await this.db
      .from("run_approvals")
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        decided_by: decidedBy,
      })
      .eq("id", approvalId);

    if (error) {
      console.error("[ApprovalManager] decide error:", error.message);
    }

    this.events.emit({
      type: "approval_decided",
      run_id: this.runId,
      approval_id: approvalId,
      decision,
    });
  }

  async expireStale(): Promise<string[]> {
    const { data } = await this.db
      .from("run_approvals")
      .update({ status: "expired" as const })
      .eq("run_id", this.runId)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .select("id");

    const ids = (data ?? []).map((d: { id: string }) => d.id);
    for (const id of ids) {
      this.events.emit({
        type: "approval_decided",
        run_id: this.runId,
        approval_id: id,
        decision: "expired",
      });
    }
    return ids;
  }

  async get(approvalId: string): Promise<RunApproval> {
    const { data, error } = await this.db
      .from("run_approvals")
      .select()
      .eq("id", approvalId)
      .single();

    if (error || !data) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    return data as RunApproval;
  }

  async listPending(): Promise<RunApproval[]> {
    const { data } = await this.db
      .from("run_approvals")
      .select()
      .eq("run_id", this.runId)
      .eq("status", "pending");

    return (data ?? []) as RunApproval[];
  }
}

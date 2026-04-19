/**
 * In-memory DelegateJobQueue — Dev/proto only.
 *
 * Phase 3 should use queue-persistent.ts backed by Supabase or Redis.
 */

import type { DelegateJob, DelegateJobQueue } from "./queue";

export class InMemoryJobQueue implements DelegateJobQueue {
  private jobs = new Map<string, DelegateJob>();

  async enqueue(
    input: Omit<
      DelegateJob,
      | "id"
      | "status"
      | "attempts"
      | "last_error"
      | "created_at"
      | "started_at"
      | "completed_at"
    >,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const job: DelegateJob = {
      ...input,
      id,
      status: "queued",
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
    };
    this.jobs.set(id, job);
    return id;
  }

  async dequeue(): Promise<DelegateJob | null> {
    const now = new Date().toISOString();
    for (const job of this.jobs.values()) {
      if (job.status === "queued" && job.available_at <= now) {
        job.status = "running";
        job.attempts += 1;
        job.started_at = now;
        return { ...job };
      }
    }
    return null;
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "completed";
      job.completed_at = new Date().toISOString();
    }
  }

  async fail(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status =
        job.attempts < job.max_attempts ? "queued" : "failed";
      job.last_error = error;
    }
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "cancelled";
    }
  }

  async get(jobId: string): Promise<DelegateJob | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }
}

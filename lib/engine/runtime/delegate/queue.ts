/**
 * Delegate Job Queue — Interface + factory.
 */

import { InMemoryJobQueue } from "./queue-memory";

export type DelegateJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface DelegateJob {
  id: string;
  run_id: string;
  step_id: string;
  agent: string;
  payload: Record<string, unknown>;
  status: DelegateJobStatus;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  last_error: string | null;
  available_at: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DelegateJobQueue {
  enqueue(
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
  ): Promise<string>;

  dequeue(): Promise<DelegateJob | null>;

  complete(jobId: string, result: Record<string, unknown>): Promise<void>;

  fail(jobId: string, error: string): Promise<void>;

  cancel(jobId: string): Promise<void>;

  get(jobId: string): Promise<DelegateJob | null>;
}

// Factory — swap implementation without touching consumers
let _queueInstance: DelegateJobQueue | null = null;

export function setJobQueue(q: DelegateJobQueue): void {
  _queueInstance = q;
}

export function getJobQueue(): DelegateJobQueue {
  if (!_queueInstance) {
    _queueInstance = new InMemoryJobQueue() as DelegateJobQueue;
  }
  return _queueInstance;
}

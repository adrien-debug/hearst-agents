/**
 * Queue factory — un singleton Queue BullMQ par JobKind.
 *
 * Usage côté API route / chat tool :
 *   await enqueueJob({ jobKind: "audio-gen", text: "…", userId, … })
 *
 * Sans REDIS_URL : enqueueJob() throw — le caller doit dégrader (par
 * exemple répondre directement sans variant ou utiliser un worker
 * inline pour les jobs courts). En production, REDIS_URL est requis.
 */

import { Queue, type JobsOptions } from "bullmq";
import { getBullConnection } from "./connection";
import { JOB_QUEUE_CONFIGS } from "./configs";
import type { JobKind, JobPayload } from "./types";

const queues = new Map<JobKind, Queue>();

function getQueue(kind: JobKind): Queue | null {
  const cached = queues.get(kind);
  if (cached) return cached;

  const connection = getBullConnection();
  if (!connection) return null;

  const config = JOB_QUEUE_CONFIGS[kind];
  const queue = new Queue(config.queueName, {
    connection,
    defaultJobOptions: {
      attempts: config.retryAttempts + 1,
      backoff: { type: "exponential", delay: config.retryDelayMs },
      removeOnComplete: config.removeOnComplete,
      removeOnFail: config.removeOnFail,
      priority: config.priority,
    },
  });
  queues.set(kind, queue);
  return queue;
}

export interface EnqueueResult {
  jobId: string;
  jobKind: JobKind;
}

/**
 * Enqueue a job for async processing. Returns the BullMQ job ID
 * immediately ; le worker pickup et streame le progress.
 *
 * Si INNGEST_EVENT_KEY est configuré, certains jobKind sont routés vers
 * Inngest (durable, serverless-compatible) plutôt que BullMQ. Migration
 * progressive : `daily-brief` est le premier ; les autres suivront.
 *
 * **Important** : le caller doit avoir déjà appelé `requireCredits()`
 * et obtenu un go avant d'enqueue, sinon on facturera potentiellement
 * un job pour un user sans crédits suffisants.
 */
export async function enqueueJob(
  payload: JobPayload,
  opts?: JobsOptions,
): Promise<EnqueueResult> {
  if (payload.jobKind === "daily-brief" && process.env.INNGEST_EVENT_KEY) {
    const { inngest } = await import("./inngest/client");
    const result = await inngest.send({
      name: "app/daily-brief.requested",
      data: payload,
    });
    return { jobId: result.ids[0] ?? "unknown", jobKind: payload.jobKind };
  }

  const queue = getQueue(payload.jobKind);
  if (!queue) {
    throw new Error(
      `[Jobs] Queue ${payload.jobKind} unavailable — REDIS_URL must be configured for async job processing`,
    );
  }

  const job = await queue.add(payload.jobKind, payload, opts);
  return { jobId: job.id ?? "unknown", jobKind: payload.jobKind };
}

/**
 * Get job state for status streaming. Used by SSE endpoint
 * /api/v2/jobs/[id]/progress.
 */
export async function getJobState(
  kind: JobKind,
  jobId: string,
): Promise<{
  state: string;
  progress: number;
  returnvalue: unknown;
  failedReason?: string;
} | null> {
  const queue = getQueue(kind);
  if (!queue) return null;

  const job = await queue.getJob(jobId);
  if (!job) return null;

  const [state, progress] = await Promise.all([job.getState(), Promise.resolve(job.progress)]);

  return {
    state: String(state),
    progress: typeof progress === "number" ? progress : 0,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

/** Utilitaire de tests : libère les queues en mémoire. */
export function resetQueuesForTests(): void {
  for (const q of queues.values()) {
    void q.close().catch(() => {});
  }
  queues.clear();
}

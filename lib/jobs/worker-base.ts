/**
 * Worker base pattern — pose le contrat que chaque worker Phase B suit.
 *
 * Un worker concret (audio-gen, image-gen, etc.) :
 *  1. Définit `processJob(payload, ctx)` qui retourne un JobResult
 *  2. Optionnel : `validateInput(payload)` pour reject precoce
 *  3. Optionnel : `onProgress(value)` mappe vers SSE event
 *
 * La base prend en charge :
 *  - Settlement automatique des crédits (settle_credits) au succès/échec
 *  - Tracking métadonnées (provider used, cost actual)
 *  - Heartbeat BullMQ pour empêcher les long-jobs d'être considérés stuck
 *  - Error logging consistant
 */

import { Worker, type Job, type Processor } from "bullmq";
import { getBullConnection } from "./connection";
import { JOB_QUEUE_CONFIGS } from "./configs";
import { settleCredits } from "@/lib/credits/client";
import type { JobKind, JobPayload, JobResult } from "./types";

export interface WorkerContext<P extends JobPayload = JobPayload> {
  /** BullMQ job — useful pour `job.updateProgress()`. */
  job: Job<P, JobResult>;
  payload: P;
  /** Update progress (0-100) and broadcast SSE event. */
  reportProgress: (value: number, message?: string) => Promise<void>;
}

export interface WorkerHandler<P extends JobPayload = JobPayload> {
  kind: JobKind;
  process: (ctx: WorkerContext<P>) => Promise<JobResult>;
  validateInput?: (payload: P) => void;
}

/**
 * Start a worker for the given JobKind. Returns the BullMQ Worker
 * instance — caller can `worker.close()` for graceful shutdown.
 */
export function startWorker<P extends JobPayload>(handler: WorkerHandler<P>): Worker<P, JobResult> | null {
  const connection = getBullConnection();
  if (!connection) {
    console.warn(`[Jobs] Worker ${handler.kind} skipped — REDIS_URL not set`);
    return null;
  }

  const config = JOB_QUEUE_CONFIGS[handler.kind];
  const processor: Processor<P, JobResult> = async (job) => {
    const payload = job.data;

    if (handler.validateInput) {
      handler.validateInput(payload);
    }

    const ctx: WorkerContext<P> = {
      job,
      payload,
      reportProgress: async (value: number, message?: string) => {
        await job.updateProgress(value);
        if (message) await job.log(message);
      },
    };

    const result = await handler.process(ctx);

    // Settle credits avec coût réel post-job. Le caller a déjà reservé
    // `payload.estimatedCostUsd` côté requireCredits ; ici on ajuste.
    if (payload.userId && payload.tenantId) {
      await settleCredits({
        userId: payload.userId,
        tenantId: payload.tenantId,
        reservedUsd: payload.estimatedCostUsd,
        actualUsd: result.actualCostUsd,
        jobId: String(job.id),
        jobKind: handler.kind,
        description: `${handler.kind} via ${result.providerUsed}`,
      }).catch((err) => {
        console.error(`[Jobs] settle_credits failed for ${handler.kind} job ${job.id}:`, err);
      });
    }

    return result;
  };

  const worker = new Worker<P, JobResult>(config.queueName, processor, {
    connection,
    concurrency: config.concurrency,
    // lockDuration doit couvrir le processing réel le plus long. Sinon
    // BullMQ considère le job stalled et le retry — ce qui facture le
    // provider 2× (ElevenLabs, fal, HeyGen, etc.) pour le même travail.
    // On prend 2× la durée max attendue pour absorber un débordement
    // ponctuel (upload R2 lent, blocking call provider).
    lockDuration: config.maxDurationMs * 2,
    stalledInterval: 30_000,
  });

  worker.on("failed", (job, err) => {
    console.error(`[Jobs] ${handler.kind} job ${job?.id} failed:`, err.message);
    // Sur échec, on libère la réservation crédit complète (refund partiel).
    if (job?.data?.userId && job?.data?.tenantId) {
      void settleCredits({
        userId: job.data.userId,
        tenantId: job.data.tenantId,
        reservedUsd: job.data.estimatedCostUsd,
        actualUsd: 0, // pas de coût facturé sur échec
        jobId: String(job.id),
        jobKind: handler.kind,
        description: `${handler.kind} failed: ${err.message}`,
      }).catch(() => {});
    }
  });

  worker.on("error", (err) => {
    console.error(`[Jobs] ${handler.kind} worker error:`, err.message);
  });

  console.log(`[Jobs] Worker ${handler.kind} started (concurrency=${config.concurrency})`);
  return worker;
}

/**
 * Job Queue Configs — concurrency / timeout / retry par JobKind.
 *
 * Une queue BullMQ par JobKind. Les workers tournent en process séparé
 * (lancés par scripts/workers.ts en prod, en main process en dev).
 */

import type { JobKind } from "./types";

export interface JobQueueConfig {
  queueName: JobKind;
  /** Workers parallèles par instance — ajuste selon le rate limit du provider. */
  concurrency: number;
  /** Timeout worker (millisecondes). Au-delà, BullMQ marque le job failed. */
  maxDurationMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  /** 1 = critique (code-exec interactif), 5 = background (memory-ingest). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Rétention BullMQ pour debug. Number = count des derniers, ou { age: seconds } pour une fenêtre temporelle. */
  removeOnComplete?: number | { age: number; count?: number };
  removeOnFail?: number | { age: number; count?: number };
}

export const JOB_QUEUE_CONFIGS: Record<JobKind, JobQueueConfig> = {
  "image-gen": {
    queueName: "image-gen",
    concurrency: 10,
    maxDurationMs: 60_000,
    retryAttempts: 2,
    retryDelayMs: 2_000,
    priority: 2,
    removeOnComplete: 100,
    removeOnFail: { age: 7 * 24 * 3600 }, // 7j
  },
  "audio-gen": {
    queueName: "audio-gen",
    concurrency: 5,
    // 180s : couvre texte long ElevenLabs (jusqu'à ~5000 chars en
    // multilingual_v2 ≈ 30s) + upload R2 lent (parfois > 60s sur cold
    // bucket). lockDuration = 2× via worker-base = 360s, marge confortable.
    maxDurationMs: 180_000,
    retryAttempts: 2,
    retryDelayMs: 3_000,
    priority: 2,
    removeOnComplete: 100,
    removeOnFail: { age: 7 * 24 * 3600 },
  },
  "video-gen": {
    queueName: "video-gen",
    concurrency: 2,
    maxDurationMs: 600_000,
    retryAttempts: 1,
    retryDelayMs: 10_000,
    priority: 3,
    removeOnComplete: 50,
    removeOnFail: { age: 14 * 24 * 3600 },
  },
  "document-parse": {
    queueName: "document-parse",
    concurrency: 5,
    maxDurationMs: 30_000,
    retryAttempts: 3,
    retryDelayMs: 1_000,
    priority: 2,
    removeOnComplete: 100,
    removeOnFail: { age: 7 * 24 * 3600 },
  },
  "code-exec": {
    queueName: "code-exec",
    concurrency: 3,
    maxDurationMs: 120_000,
    retryAttempts: 1,
    retryDelayMs: 5_000,
    priority: 1,
    removeOnComplete: 100,
    removeOnFail: { age: 7 * 24 * 3600 },
  },
  "browser-task": {
    queueName: "browser-task",
    concurrency: 2,
    maxDurationMs: 1_800_000, // 30 min
    retryAttempts: 1,
    retryDelayMs: 10_000,
    priority: 3,
    removeOnComplete: 50,
    removeOnFail: { age: 14 * 24 * 3600 },
  },
  "meeting-bot": {
    queueName: "meeting-bot",
    concurrency: 3,
    maxDurationMs: 7_200_000, // 2h
    retryAttempts: 0,
    retryDelayMs: 0,
    priority: 2,
    removeOnComplete: 50,
    removeOnFail: { age: 14 * 24 * 3600 },
  },
  "memory-ingest": {
    queueName: "memory-ingest",
    concurrency: 5,
    maxDurationMs: 60_000,
    retryAttempts: 3,
    retryDelayMs: 2_000,
    priority: 4,
    removeOnComplete: 200,
    removeOnFail: { age: 7 * 24 * 3600 },
  },
  "asset-variant": {
    queueName: "asset-variant",
    concurrency: 5,
    maxDurationMs: 300_000, // 5 min — wrapper qui re-dispatch vers audio/video/slides
    retryAttempts: 2,
    retryDelayMs: 5_000,
    priority: 3,
    removeOnComplete: 100,
    removeOnFail: { age: 7 * 24 * 3600 },
  },
};

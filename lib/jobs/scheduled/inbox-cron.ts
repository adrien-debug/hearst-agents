/**
 * Inbox Cron — BullMQ Repeatable Jobs par user actif.
 *
 * Stratégie multi-instance safe :
 *  - Au boot, on liste les users avec `integration_connections` actives
 *    (gmail/slack/google) et on ajoute pour chacun un Repeatable Job
 *    BullMQ avec un jobId déterministe (`inbox-fetch:repeat:{userId}:{tenantId}:{workspaceId}`).
 *  - BullMQ déduplique sur jobId : si N instances du serveur appellent
 *    `startInboxCron()` en parallèle, un seul repeatable job est créé.
 *  - Le worker `inbox-fetch` consomme la queue et n'a plus besoin de
 *    setInterval local. La répétition (every 30min) est gérée par Redis
 *    côté BullMQ — un seul tick effectif par user, peu importe le
 *    nombre d'instances.
 *
 * Sans REDIS_URL : no-op + log warn (pas de fallback setInterval — on
 * accepte que le cron ne tourne pas en dev sans Redis ; le manual refresh
 * via POST /api/v2/inbox/refresh reste disponible).
 *
 * Throttle global (5min/user) : conservé pour POST /api/v2/inbox/refresh
 * (manual trigger), pas appliqué côté tick (BullMQ rythme déjà à 30min).
 */

import { Queue } from "bullmq";
import { getBullConnection } from "@/lib/jobs/connection";
import { JOB_QUEUE_CONFIGS } from "@/lib/jobs/configs";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxFetchInput } from "@/lib/jobs/types";

const REPEAT_EVERY_MS = 30 * 60_000; // 30 min
const MIN_INTERVAL_MS = 5 * 60_000; // throttle 5 min par user (manual refresh)

let _started = false;
let _inboxQueue: Queue | null = null;
const _lastEnqueueByUser = new Map<string, number>();

/** Throttle global pour /api/v2/inbox/refresh (manual). */
export function canEnqueueInboxFetch(userId: string): boolean {
  const last = _lastEnqueueByUser.get(userId) ?? 0;
  return Date.now() - last >= MIN_INTERVAL_MS;
}

export function markInboxFetchEnqueued(userId: string): void {
  _lastEnqueueByUser.set(userId, Date.now());
}

interface ActiveUser {
  userId: string;
  tenantId: string;
  workspaceId: string;
}

function repeatJobId(userId: string, tenantId: string, workspaceId: string): string {
  return `inbox-fetch:repeat:${userId}:${tenantId}:${workspaceId}`;
}

async function getActiveInboxUsers(): Promise<ActiveUser[]> {
  const sb = getServerSupabase() as unknown as SupabaseClient | null;
  if (!sb) return [];

  const { data, error } = await sb
    .from("integration_connections")
    .select("config, provider, status")
    .in("provider", ["google", "gmail", "slack"])
    .eq("status", "connected")
    .limit(500);

  if (error || !data) return [];

  const seen = new Set<string>();
  const out: ActiveUser[] = [];
  for (const row of data as Array<{ config: unknown }>) {
    const cfg = (row.config ?? {}) as { userId?: string; tenantId?: string; workspaceId?: string };
    if (!cfg.userId || !cfg.tenantId || !cfg.workspaceId) continue;
    const key = `${cfg.userId}:${cfg.tenantId}:${cfg.workspaceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: cfg.userId, tenantId: cfg.tenantId, workspaceId: cfg.workspaceId });
  }
  return out;
}

/**
 * Ajoute un repeatable job pour un user. Idempotent — BullMQ déduplique
 * via jobId si déjà présent. Exporté pour permettre l'enregistrement à
 * la connexion d'un nouveau user (event app.user.connected).
 */
export async function registerInboxRepeatable(user: ActiveUser): Promise<void> {
  if (!_inboxQueue) return;
  const jobId = repeatJobId(user.userId, user.tenantId, user.workspaceId);
  const payload: InboxFetchInput = {
    jobKind: "inbox-fetch",
    userId: user.userId,
    tenantId: user.tenantId,
    workspaceId: user.workspaceId,
    estimatedCostUsd: 0.002,
    trigger: "cron",
  };

  try {
    await _inboxQueue.add(
      "inbox-fetch",
      payload,
      {
        repeat: { every: REPEAT_EVERY_MS },
        jobId,
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    );
  } catch (err) {
    console.warn(`[InboxCron] register repeatable failed for ${user.userId}:`, err);
  }
}

/**
 * Désinscrit un user du cron (event app.user.disconnected).
 */
export async function unregisterInboxRepeatable(user: ActiveUser): Promise<void> {
  if (!_inboxQueue) return;
  const jobId = repeatJobId(user.userId, user.tenantId, user.workspaceId);
  try {
    await _inboxQueue.removeRepeatable("inbox-fetch", { every: REPEAT_EVERY_MS, jobId });
  } catch (err) {
    console.warn(`[InboxCron] unregister repeatable failed for ${user.userId}:`, err);
  }
}

/**
 * Boot point — démarre le cron BullMQ.
 *  - Sans REDIS_URL : no-op (log warn).
 *  - Avec REDIS_URL : crée la queue `inbox-fetch`, liste les users actifs
 *    et enregistre un repeatable job par user (idempotent).
 *
 * Appel multiple safe : la deuxième invocation court-circuite immédiatement.
 */
export async function startInboxCron(): Promise<void> {
  if (_started) return;
  _started = true;

  const connection = getBullConnection();
  if (!connection) {
    console.warn("[InboxCron] REDIS_URL absent — cron disabled (manual refresh only)");
    return;
  }

  try {
    const config = JOB_QUEUE_CONFIGS["inbox-fetch"];
    _inboxQueue = new Queue(config.queueName, { connection });

    const users = await getActiveInboxUsers();
    if (users.length === 0) {
      console.log("[InboxCron] no active users — repeatable jobs deferred");
      return;
    }

    for (const u of users) {
      await registerInboxRepeatable(u);
    }
    console.log(
      `[InboxCron] ${users.length} repeatable jobs scheduled every ${REPEAT_EVERY_MS / 60_000}min via BullMQ`,
    );
  } catch (err) {
    console.warn("[InboxCron] BullMQ setup failed:", err);
  }

  if (typeof process !== "undefined") {
    const stop = () => {
      void _inboxQueue?.close().catch(() => {});
      _inboxQueue = null;
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }
}

/** Test-only — reset l'état pour permettre des startInboxCron() successifs. */
export function resetInboxCronForTests(): void {
  _started = false;
  _inboxQueue = null;
  _lastEnqueueByUser.clear();
}

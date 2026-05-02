/**
 * BullMQ Redis connection — séparée de la connexion WAL (lib/platform/redis).
 *
 * BullMQ exige `maxRetriesPerRequest: null` et `enableReadyCheck: false`
 * sur sa connexion (sinon les blocking commands `bzpopmin` du worker
 * lèvent des erreurs). Notre WAL Redis utilise `maxRetriesPerRequest: 1`
 * pour le contraire (échoue vite plutôt que bloquer le request handler).
 *
 * Donc deux instances ioredis distinctes :
 *  - lib/platform/redis/client.ts : WAL + cache, échec rapide
 *  - lib/jobs/connection.ts       : BullMQ, blocking commands OK
 */

import IORedis, { type Redis } from "ioredis";

let _bullConnection: Redis | null = null;

export function getBullConnection(): Redis | null {
  if (_bullConnection) return _bullConnection;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[Jobs] REDIS_URL not set — BullMQ disabled (jobs will execute inline as fallback)");
    return null;
  }

  _bullConnection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5_000,
  });

  _bullConnection.on("error", (err) => {
    console.warn("[Jobs] BullMQ Redis error:", err.message);
  });

  return _bullConnection;
}

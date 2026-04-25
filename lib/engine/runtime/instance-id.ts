/**
 * Canonical instance identifier — stable for the lifetime of the process.
 *
 * Uses INSTANCE_ID or HOSTNAME env if set (container/cloud runtimes),
 * otherwise generates a random id at boot.
 */

import { randomUUID } from "crypto";

export const INSTANCE_ID: string =
  process.env.INSTANCE_ID ||
  process.env.HOSTNAME ||
  `local-${randomUUID().slice(0, 8)}`;

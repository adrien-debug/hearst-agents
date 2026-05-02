/**
 * Inngest client — durable serverless job orchestration.
 * Remplace BullMQ workers sur Vercel (incompatible avec serverless long-running).
 *
 * Migration progressive depuis lib/jobs/queue.ts :
 *   - Phase 1 : daily-brief, image-gen, inbox-fetch
 *   - Phase 2 : audio-gen, document-parse, code-exec, browser-task, video-gen, meeting-bot
 *
 * Documentation : https://www.inngest.com/docs
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "hearst-os",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export const isInngestEnabled = (): boolean =>
  Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);

// ── Function definitions ───────────────────────────────────────

import { dailyBriefFunction } from "./functions/daily-brief";

export const inngestFunctions = [dailyBriefFunction];

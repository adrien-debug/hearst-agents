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

// ── Function definitions (à remplir au fil de la migration) ─────

/**
 * Exemple de fonction Inngest. À remplacer par les vraies fonctions migrées
 * depuis lib/jobs/workers/*.ts.
 *
 * export const dailyBrief = inngest.createFunction(
 *   { id: "daily-brief", name: "Daily Brief Generation" },
 *   { cron: "TZ=Europe/Paris 0 7 * * *" },
 *   async ({ event, step }) => { ... }
 * );
 */

export const inngestFunctions: ReturnType<typeof inngest.createFunction>[] = [];

/**
 * Workers boot — démarre tous les workers Phase B.
 *
 * Appelé une seule fois côté serveur (instrumentation.ts).
 * Sans REDIS_URL : aucun worker ne démarre, les jobs throw à l'enqueue.
 */

import { startAudioGenWorker } from "./audio-gen";
import { startImageGenWorker } from "./image-gen";
import { startDocumentParseWorker } from "./document-parse";
import { startCodeExecWorker } from "./code-exec";
import { startVideoGenWorker } from "./video-gen";
import { startBrowserTaskWorker } from "./browser-task";
import { startInboxFetchWorker } from "./inbox-fetch";
import { startMeetingBotWorker } from "./meeting-bot";
import { startInboxCron } from "../scheduled/inbox-cron";

let _started = false;

export function startAllWorkers(): void {
  if (_started) return;
  _started = true;

  startAudioGenWorker();
  startImageGenWorker();
  startDocumentParseWorker();
  startCodeExecWorker();
  startVideoGenWorker();
  startBrowserTaskWorker();
  startInboxFetchWorker();
  startMeetingBotWorker();
  void startInboxCron();
  // startMemoryIngestWorker();  // Phase B.10 (Letta + pgvector)
  // startAssetVariantWorker();  // wrapper qui re-dispatch
}

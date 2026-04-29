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

let _started = false;

export function startAllWorkers(): void {
  if (_started) return;
  _started = true;

  startAudioGenWorker();
  startImageGenWorker();
  startDocumentParseWorker();
  startCodeExecWorker();
  startVideoGenWorker();
  // startBrowserTaskWorker();   // Phase B.8 (Browserbase + Computer Use)
  // startMeetingBotWorker();    // Phase B.9 (Recall + Deepgram)
  // startMemoryIngestWorker();  // Phase B.10 (Letta + pgvector)
  // startAssetVariantWorker();  // wrapper qui re-dispatch
}

/**
 * Workers boot — démarre tous les workers Phase B.
 *
 * Appelé une seule fois côté serveur (instrumentation.ts).
 * Sans REDIS_URL : aucun worker ne démarre, les jobs throw à l'enqueue.
 */

import { startAudioGenWorker } from "./audio-gen";

let _started = false;

export function startAllWorkers(): void {
  if (_started) return;
  _started = true;

  startAudioGenWorker();
  // startImageGenWorker();      // Phase B.2 (fal.ai)
  // startVideoGenWorker();      // Phase B.7 (HeyGen + Runway)
  // startDocumentParseWorker(); // Phase B.4 (LlamaParse)
  // startCodeExecWorker();      // Phase B.5 (E2B)
  // startBrowserTaskWorker();   // Phase B.8 (Browserbase + Computer Use)
  // startMeetingBotWorker();    // Phase B.9 (Recall + Deepgram)
  // startMemoryIngestWorker();  // Phase B.10 (Letta + pgvector)
  // startAssetVariantWorker();  // wrapper qui re-dispatch
}

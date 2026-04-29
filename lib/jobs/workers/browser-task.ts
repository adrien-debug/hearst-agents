import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { createSession, stopSession } from "@/lib/capabilities/providers/browserbase";
import type { BrowserTaskInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<BrowserTaskInput> = {
  kind: "browser-task",

  validateInput(payload) {
    if (!payload.task?.trim()) throw new Error("browser-task: task est vide");
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    let sessionId: string | undefined;

    try {
      await reportProgress(10, "Création session Browserbase");
      const session = await createSession();
      sessionId = session.sessionId;

      await reportProgress(50, "Session active");

      // Phase B.8 stub : retourne les détails de session
      // Phase B.8 complète ajoutera Playwright + Stagehand ici
      await reportProgress(100, "Session créée");

      return {
        assetId: payload.assetId,
        providerUsed: "browserbase",
        actualCostUsd: 0,
        metadata: {
          sessionId: session.sessionId,
          connectUrl: session.connectUrl,
          debugViewerUrl: session.debugViewerUrl,
          task: payload.task,
          startUrl: payload.startUrl,
        },
      };
    } finally {
      if (sessionId) {
        await stopSession(sessionId).catch(() => {});
      }
    }
  },
};

export function startBrowserTaskWorker() {
  return startWorker(handler);
}

import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { executeCode } from "@/lib/capabilities/providers/e2b";
import { updateVariant } from "@/lib/assets/variants";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import type { CodeExecInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<CodeExecInput> = {
  kind: "code-exec",

  validateInput(payload) {
    if (!payload.code || payload.code.trim().length === 0) {
      throw new Error("code-exec: code is empty");
    }
    if (payload.runtime !== "python" && payload.runtime !== "node") {
      throw new Error(`code-exec: unsupported runtime "${payload.runtime}"`);
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const variantId = (payload as CodeExecInput & { variantId?: string }).variantId
      ?? (typeof payload === "object" && payload !== null && "metadata" in payload
        ? ((payload as { metadata?: { variantId?: string } }).metadata?.variantId)
        : undefined);

    await reportProgress(5, "Démarrage du sandbox");

    const execResult = await executeCode({
      code: payload.code,
      language: payload.runtime === "node" ? "javascript" : "python",
      timeoutMs: payload.timeoutMs,
    });

    await reportProgress(70, "Exécution terminée, upload du résultat");

    const storage = getGlobalStorage();
    const variantKey = variantId ?? `exec-${ctx.job.id}`;
    const storageKey = `code-exec/${payload.assetId ?? "orphan"}/${variantKey}.json`;

    const resultJson = JSON.stringify(execResult, null, 2);
    const upload = await storage.upload(storageKey, Buffer.from(resultJson, "utf-8"), {
      contentType: "application/json",
      tenantId: payload.tenantId,
      metadata: {
        userId: payload.userId,
        runtime: payload.runtime,
        hasError: execResult.error ? "1" : "0",
      },
    });

    await reportProgress(90, "Persistance");

    if (variantId) {
      await updateVariant(variantId, {
        status: execResult.error ? "failed" : "ready",
        storageUrl: upload.url,
        mimeType: "application/json",
        sizeBytes: upload.size,
        generatedAt: Date.now(),
        provider: "e2b",
        metadata: {
          runtime: payload.runtime,
          error: execResult.error,
          stdoutLen: execResult.stdout.length,
        },
      });
    }

    await reportProgress(100, "Exécution prête");

    return {
      assetId: payload.assetId,
      variantId,
      storageUrl: upload.url,
      actualCostUsd: 0.001,
      providerUsed: "e2b",
      modelUsed: `e2b-${payload.runtime}`,
      metadata: {
        stdout: execResult.stdout.slice(0, 500),
        stderr: execResult.stderr.slice(0, 500),
        error: execResult.error,
        resultsCount: execResult.results.length,
      },
    };
  },
};

export function startCodeExecWorker() {
  return startWorker(handler);
}

/**
 * Worker document-parse — Phase B.4 (LlamaParse).
 *
 * Consomme la queue `document-parse`. Pour chaque job :
 *  1. Appelle LlamaParse avec l'URL du fichier
 *  2. Upload le Markdown résultant dans le storage global
 *  3. Update le row asset_variants : status="ready", storage_url, mime
 *  4. Settle credits via worker-base
 */

import { Buffer } from "node:buffer";
import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { parseDocument } from "@/lib/capabilities/providers/llamaparse";
import { updateVariant } from "@/lib/assets/variants";
import { getGlobalStorage } from "@/lib/engine/runtime/assets/storage";
import type { DocumentParseInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<DocumentParseInput> = {
  kind: "document-parse",

  validateInput(payload) {
    if (!payload.fileUrl) {
      throw new Error("document-parse: fileUrl is required");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;
    const variantId = (payload as DocumentParseInput & { variantId?: string }).variantId
      ?? (typeof payload === "object" && payload !== null && "metadata" in payload
        ? ((payload as { metadata?: { variantId?: string } }).metadata?.variantId)
        : undefined);

    await reportProgress(5, "Parsing en cours");

    // 1. LlamaParse
    const parsed = await parseDocument({
      fileUrl: payload.fileUrl,
      mimeType: payload.mimeType,
    });

    await reportProgress(60, "Document parsé, upload en cours");

    // 2. Upload Markdown to storage
    const storage = getGlobalStorage();
    const variantKey = variantId ?? `doc-${ctx.job.id}`;
    const storageKey = `documents/${payload.assetId ?? "orphan"}/${variantKey}.md`;

    const mdBuffer = Buffer.from(parsed.markdown, "utf-8");
    const upload = await storage.upload(storageKey, mdBuffer, {
      contentType: "text/markdown",
      tenantId: payload.tenantId,
      metadata: {
        userId: payload.userId,
        fileName: payload.fileName,
        pages: String(parsed.pages),
      },
    });

    await reportProgress(85, "Upload terminé, persistance");

    // 3. Update DB row asset_variants
    if (variantId) {
      await updateVariant(variantId, {
        status: "ready",
        storageUrl: upload.url,
        mimeType: "text/markdown",
        sizeBytes: upload.size,
        generatedAt: Date.now(),
        provider: "llamaparse",
        metadata: {
          pages: parsed.pages,
          sourceFile: payload.fileName,
        },
      });
    }

    await reportProgress(100, "Document prêt");

    return {
      assetId: payload.assetId,
      variantId,
      storageUrl: upload.url,
      actualCostUsd: 0,
      providerUsed: "llamaparse",
      modelUsed: "llama-parse",
      metadata: {
        pages: parsed.pages,
        chars: parsed.markdown.length,
      },
    };
  },
};

export function startDocumentParseWorker() {
  return startWorker(handler);
}

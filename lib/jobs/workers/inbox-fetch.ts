/**
 * Worker inbox-fetch — Phase B.7 (B7 Inbox Intelligence).
 *
 * Consomme la queue `inbox-fetch`. Pour chaque job :
 *  1. generateInboxBrief(userId, tenantId)
 *  2. Persiste un asset `kind: "inbox_brief"` (le contentRef = JSON brief)
 *  3. Retourne assetId pour traceability
 *
 * Pas de provider/coût externe ici (sauf appel Haiku ~0.001$ par batch),
 * donc estimatedCostUsd ≈ 0 et settle_credits passera.
 */

import { randomUUID } from "node:crypto";
import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { storeAsset } from "@/lib/assets/types";
import { generateInboxBrief } from "@/lib/inbox/inbox-brief";
import type { InboxFetchInput, JobResult } from "@/lib/jobs/types";

const handler: WorkerHandler<InboxFetchInput> = {
  kind: "inbox-fetch",

  validateInput(payload) {
    if (!payload.userId || !payload.tenantId) {
      throw new Error("inbox-fetch: userId/tenantId requis");
    }
  },

  async process(ctx): Promise<JobResult> {
    const { payload, reportProgress } = ctx;

    await reportProgress(10, "Fetch sources (Gmail/Slack/Calendar)");

    const brief = await generateInboxBrief(payload.userId, payload.tenantId, {
      gmailLimit: payload.gmailLimit,
      calendarLimit: payload.calendarLimit,
    });

    await reportProgress(70, `Brief généré (${brief.items.length} items)`);

    // Persistance asset
    const assetId = randomUUID();
    const threadId = `inbox:${payload.userId}`;
    await storeAsset({
      id: assetId,
      threadId,
      kind: "inbox_brief",
      title: `Inbox · ${new Date(brief.generatedAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      summary: brief.empty
        ? "Aucun signal entrant"
        : `${brief.items.length} signaux · ${brief.items.filter((i) => i.priority === "urgent").length} urgents`,
      contentRef: JSON.stringify(brief),
      createdAt: brief.generatedAt,
      provenance: {
        providerId: "system",
        userId: payload.userId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });

    await reportProgress(100, "Inbox brief prêt");

    console.log(
      `[InboxFetch] user=${payload.userId} items=${brief.items.length} sources=[${brief.sources.join(",")}] assetId=${assetId}`,
    );

    return {
      assetId,
      actualCostUsd: 0.001, // ~Haiku coût symbolique
      providerUsed: "inbox-brief",
      metadata: {
        itemCount: brief.items.length,
        sources: brief.sources,
        urgent: brief.items.filter((i) => i.priority === "urgent").length,
      },
    };
  },
};

export function startInboxFetchWorker() {
  console.log("[InboxFetch] worker started");
  return startWorker(handler);
}

/**
 * Inngest function — Daily Brief Generation.
 *
 * Migration depuis le worker BullMQ `lib/jobs/workers/daily-brief.ts`.
 * Conserve la même logique métier (assemble → narrate → render → store)
 * mais découpée en `step.run(...)` pour bénéficier du retry automatique
 * par étape côté Inngest.
 *
 * Triggers :
 *  - Event `app/daily-brief.requested` (déclenchement manuel ou par cron host)
 *  - Cron `TZ=Europe/Paris 0 7 * * *` (à activer quand la liste des users actifs
 *    est centralisée — pour l'instant, le cron émet l'event par user via un
 *    autre orchestrateur).
 */

import { randomUUID } from "node:crypto";
import { inngest } from "@/lib/jobs/inngest/client";
import { storeAsset } from "@/lib/assets/types";
import { persistExport, getExportSignedUrl } from "@/lib/reports/export/store";
import { assembleDailyBriefData } from "@/lib/daily-brief/assembler";
import { generateDailyBriefNarration } from "@/lib/daily-brief/generate";
import { renderDailyBriefPdf } from "@/lib/daily-brief/pdf";
import type { DailyBriefAssetMeta } from "@/lib/daily-brief/types";
import type { DailyBriefInput } from "@/lib/jobs/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const dailyBriefFunction = inngest.createFunction(
  {
    id: "daily-brief",
    name: "Daily Brief Generation",
    retries: 2,
    triggers: [{ event: "app/daily-brief.requested" }],
  },
  async ({ event, step }) => {
    const payload = event.data as DailyBriefInput;

    if (!payload.userId || !payload.tenantId) {
      throw new Error("daily-brief: userId/tenantId requis");
    }

    const targetDate = payload.targetDate ?? todayIso();

    const data = await step.run("assemble-data-sources", () =>
      assembleDailyBriefData({
        userId: payload.userId,
        tenantId: payload.tenantId,
        targetDate,
        gmailLimit: payload.gmailLimit,
        slackLimit: payload.slackLimit,
        githubLimit: payload.githubLimit,
        linearLimit: payload.linearLimit,
      }),
    );

    const narration = await step.run("generate-narration", () =>
      generateDailyBriefNarration(data),
    );

    const assetId = randomUUID();

    // Render + upload combinés : Inngest sérialise les retours de step.run en
    // JSON, ce qui casse les Buffer. On garde la PDF en mémoire le temps d'un
    // seul step et on ne retourne que les métadonnées.
    const persisted = await step.run("render-and-upload-pdf", async () => {
      const pdf = await renderDailyBriefPdf({
        data,
        narration,
        date: new Date(targetDate),
      });
      const result = await persistExport({
        result: pdf,
        format: "pdf",
        assetId,
        tenantId: payload.tenantId,
        createdBy: payload.userId,
      });
      return {
        storageKey: result.storageKey,
        storageUrl: result.storageUrl,
        fileName: pdf.fileName,
        size: pdf.size,
      };
    });

    const signedUrl = await step.run("sign-pdf-url", async () => {
      try {
        return await getExportSignedUrl(persisted.storageKey, {
          expiresInSeconds: 24 * 3600,
          downloadName: persisted.fileName,
        });
      } catch (err) {
        console.warn("[DailyBrief/Inngest] signed URL échouée :", err);
        return null;
      }
    });

    const extrasItemCount = data.extras.reduce((acc, ex) => acc + ex.items.length, 0);
    const totalItems =
      data.emails.length +
      data.slack.length +
      data.calendar.length +
      data.github.length +
      data.linear.length +
      extrasItemCount;

    await step.run("store-asset", async () => {
      const meta: DailyBriefAssetMeta = {
        totalItems,
        sources: data.sources,
        targetDate,
        pdfUrl: signedUrl,
        storageKey: persisted.storageKey,
        pdfSizeBytes: persisted.size,
      };

      const threadId = `daily-brief:${payload.userId}`;
      const titleDate = new Date(targetDate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const activeSources = data.sources.filter(
        (s: string) => !s.endsWith(":error") && !s.endsWith(":empty"),
      );

      await storeAsset({
        id: assetId,
        threadId,
        kind: "daily_brief",
        title: `Daily Brief · ${titleDate}`,
        summary:
          activeSources.length > 0
            ? `${totalItems} signaux · ${activeSources.join(", ")}`
            : "Aucune source connectée — connecte Gmail/Slack/GitHub/Linear pour activer.",
        contentRef: JSON.stringify({
          narration,
          meta,
          counts: {
            emails: data.emails.length,
            slack: data.slack.length,
            calendar: data.calendar.length,
            github: data.github.length,
            linear: data.linear.length,
            extras: Object.fromEntries(data.extras.map((e) => [e.toolkit, e.items.length])),
          },
        }),
        createdAt: data.generatedAt,
        provenance: {
          providerId: "system",
          userId: payload.userId,
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
    });

    console.log(
      `[DailyBrief/Inngest] user=${payload.userId.slice(0, 8)} signals=${totalItems} sources=[${data.sources.join(",")}] cost=$${narration.costUsd.toFixed(4)} assetId=${assetId}`,
    );

    return {
      assetId,
      storageUrl: persisted.storageUrl,
      actualCostUsd: narration.costUsd,
      providerUsed: "anthropic-sonnet-4-6",
      modelUsed: "claude-sonnet-4-6",
      metadata: {
        totalItems,
        sources: data.sources,
        targetDate,
        pdfSizeBytes: persisted.size,
      },
    };
  },
);

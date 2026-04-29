/**
 * Deterministic Research Report Runner.
 *
 * Bypasses the probabilistic planner for obvious research/report requests
 * (« cherche … », « rapport sur … »). Uses real web search → structured LLM
 * synthesis → asset persisté V2 + PDF artifact.
 *
 * **Recâblé V2 (29/04/2026)** — l'asset produit suit le même schéma que les
 * reports catalog (`kind="report"`, `provenance.specId="research"`,
 * `runArtifact: true`, `contentRef` JSON `{ payload, narration, research,
 * pdfFile? }`). Persisté via `storeAsset` de `lib/assets/types.ts` → table
 * Supabase `assets`. Plus de `createAsset` runtime in-memory only.
 */
import { randomUUID } from "crypto";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { searchWeb, type WebSearchResult } from "@/lib/tools/handlers/web-search";
import { storeAsset, type Asset } from "@/lib/assets/types";
import { generatePdfArtifact } from "@/lib/engine/runtime/assets/generators/pdf";
import type { AssetFileInfo } from "@/lib/engine/runtime/assets/types";
import { extractResearchQuery, isReportIntent } from "./research-intent";
import Anthropic from "@anthropic-ai/sdk";

export interface ResearchReportInput {
  message: string;
  engine: RunEngine;
  eventBus: RunEventBus;
  scope: TenantScope;
  threadId?: string;
}

export async function runResearchReport(input: ResearchReportInput): Promise<void> {
  const { engine, eventBus, scope } = input;
  const query = extractResearchQuery(input.message);

  const stepId = `research-${engine.id}`;

  eventBus.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: stepId,
    title: "Web search",
    agent: "KnowledgeRetriever",
  });

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `Research: searching the web for "${query}"`,
  });

  // ── 1. Web search ──────────────────────────────────────────
  let searchResult: WebSearchResult;
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Web search provider unavailable — ANTHROPIC_API_KEY not configured");
    }
    searchResult = await searchWeb(query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Web search failed";
    console.error("[ResearchReport] search error:", msg);

    eventBus.emit({
      type: "step_failed",
      run_id: engine.id,
      step_id: stepId,
      error: msg,
    });
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Research failed: ${msg}`,
    });
    eventBus.emit({
      type: "text_delta",
      run_id: engine.id,
      delta: `Impossible de générer le rapport : ${msg}`,
    });

    await engine.fail(msg);
    return;
  }

  eventBus.emit({
    type: "step_completed",
    run_id: engine.id,
    step_id: stepId,
    agent: "KnowledgeRetriever",
  });

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `Web search completed: ${searchResult.results.length} source(s) found`,
  });

  // ── 2. Synthesize report ───────────────────────────────────
  const synthStepId = `synthesis-${engine.id}`;
  eventBus.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: synthStepId,
    title: "Report synthesis",
    agent: "DocBuilder",
  });

  let reportText: string;
  try {
    reportText = await synthesizeReport(query, searchResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Report synthesis failed";
    console.error("[ResearchReport] synthesis error:", msg);

    eventBus.emit({
      type: "step_failed",
      run_id: engine.id,
      step_id: synthStepId,
      error: msg,
    });

    reportText = searchResult.summary || `No synthesis possible for: ${query}`;
  }

  eventBus.emit({
    type: "step_completed",
    run_id: engine.id,
    step_id: synthStepId,
    agent: "DocBuilder",
  });

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `Report synthesized (${reportText.length} chars)`,
  });

  // ── 3. Stream report to chat ───────────────────────────────
  eventBus.emit({
    type: "text_delta",
    run_id: engine.id,
    delta: reportText,
  });

  // ── 4. Persist asset (V2 — même chemin que /api/v2/reports/[specId]/run) ─
  const shouldCreateAsset = isReportIntent(input.message) || reportText.length > 500;

  if (shouldCreateAsset) {
    const assetId = randomUUID();
    const assetName = buildAssetName(query);
    const threadId = input.threadId ?? engine.id;

    // Génère le PDF avant de persister, pour pouvoir inclure ses infos
    // dans le contentRef de l'asset.
    let pdfFile: AssetFileInfo | null = null;
    try {
      pdfFile = await generatePdfArtifact({
        tenantId: scope.tenantId,
        runId: engine.id,
        assetId,
        title: assetName,
        content: reportText,
      });
      console.log(
        `[ResearchReport] PDF generated: ${pdfFile.fileName} (${pdfFile.sizeBytes} bytes)`,
      );
    } catch (err) {
      console.error("[ResearchReport] PDF generation failed:", err);
    }

    // Format contentRef aligné sur les reports V2 catalog : `payload` reste
    // vide (pas de blocks pour une recherche libre), `narration` porte le
    // markdown synthétisé, `research` garde sources/query. Le `pdfFile`
    // est dans la provenance — pas dans le contentRef — pour que le
    // download endpoint le retrouve sans parser le JSON.
    const contentRef = JSON.stringify({
      payload: { blocks: [], generatedAt: Date.now() },
      narration: reportText,
      research: {
        query,
        sourcesCount: searchResult.results.length,
        sources: searchResult.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
        })),
      },
    });

    const asset: Asset = {
      id: assetId,
      threadId,
      kind: "report",
      title: assetName,
      summary: reportText.slice(0, 200),
      provenance: {
        providerId: "system",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        specId: "research",
        runArtifact: true,
        reportMeta: { signals: [], severity: "info" },
        ...(pdfFile ? { pdfFile } : {}),
      },
      createdAt: Date.now(),
      contentRef,
      runId: engine.id,
    };

    storeAsset(asset);

    eventBus.emit({
      type: "asset_generated",
      run_id: engine.id,
      asset_id: asset.id,
      asset_type: "report",
      name: asset.title,
      ...(pdfFile
        ? {
            filePath: pdfFile.filePath,
            fileName: pdfFile.fileName,
            mimeType: pdfFile.mimeType,
            sizeBytes: pdfFile.sizeBytes,
          }
        : {}),
    });

    eventBus.emit({
      type: "focal_object_ready",
      run_id: engine.id,
      focal_object: {
        objectType: "report",
        id: `fo_${asset.id}`,
        threadId,
        title: asset.title,
        status: "delivered",
        createdAt: asset.createdAt,
        updatedAt: asset.createdAt,
        sourceAssetId: asset.id,
        morphTarget: null,
        summary: reportText.slice(0, 200),
        sections: [],
        tier: "report",
        tone: "executive",
        wordCount: reportText.split(/\s+/).length,
      },
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Asset created: ${asset.title}${pdfFile ? ` (${pdfFile.fileName})` : ""}`,
    });
  }

  await engine.complete();
}

// ── Helpers ──────────────────────────────────────────────────

async function synthesizeReport(
  query: string,
  search: WebSearchResult,
): Promise<string> {
  if (search.summary && search.summary.length > 200) {
    return search.summary;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const sourcesContext = search.results
    .slice(0, 8)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system:
      "Tu es un analyste expert. Rédige un rapport structuré, factuel et professionnel en français. " +
      "Utilise des titres, sous-titres et bullet points. Cite les sources quand pertinent.",
    messages: [
      {
        role: "user",
        content: `Rédige un rapport structuré sur : "${query}"\n\nSources disponibles :\n${sourcesContext}`,
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function buildAssetName(query: string): string {
  const cleaned = query
    .replace(/[^\w\sàâäéèêëïîôùûüÿçæœ-]/gi, "")
    .trim()
    .slice(0, 50);

  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return `${capitalized} — Report`;
}

/**
 * Deterministic Research Report Runner.
 *
 * Bypasses the probabilistic planner for obvious research/report requests.
 * Uses real web search → structured synthesis → asset creation.
 */

import type { RunEngine } from "../runtime/engine";
import type { RunEventBus } from "../events/bus";
import type { TenantScope } from "../multi-tenant/types";
import { searchWeb, type WebSearchResult } from "../tools/handlers/web-search";
import { createAsset } from "../runtime/assets/create-asset";
import { generatePdfArtifact } from "../runtime/assets/generate-pdf";
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

  // ── 4. Create asset (always for report intent, conditionally for pure research) ──
  const shouldCreateAsset = isReportIntent(input.message) || reportText.length > 500;

  if (shouldCreateAsset) {
    const assetName = buildAssetName(query);
    const asset = createAsset({
      type: "report",
      name: assetName,
      run_id: engine.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      metadata: {
        query,
        content: reportText,
        sources_count: searchResult.results.length,
        sources: searchResult.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
        })),
      },
    });

    // Generate real PDF artifact
    try {
      const fileInfo = await generatePdfArtifact({
        tenantId: scope.tenantId,
        runId: engine.id,
        assetId: asset.id,
        title: assetName,
        content: reportText,
      });
      asset.file = fileInfo;
      if (asset.metadata) {
        asset.metadata._filePath = fileInfo.filePath;
        asset.metadata._fileName = fileInfo.fileName;
        asset.metadata._mimeType = fileInfo.mimeType;
        asset.metadata._sizeBytes = fileInfo.sizeBytes;
      }
      console.log(`[ResearchReport] PDF generated: ${fileInfo.fileName} (${fileInfo.sizeBytes} bytes)`);
    } catch (err) {
      console.error("[ResearchReport] PDF generation failed:", err);
    }

    eventBus.emit({
      type: "asset_generated",
      run_id: engine.id,
      asset_id: asset.id,
      asset_type: asset.type,
      name: asset.name,
      ...(asset.file ? {
        filePath: asset.file.filePath,
        fileName: asset.file.fileName,
        mimeType: asset.file.mimeType,
        sizeBytes: asset.file.sizeBytes,
      } : {}),
    });

    eventBus.emit({
      type: "focal_object_ready",
      run_id: engine.id,
      focal_object: {
        objectType: "report",
        id: `fo_${asset.id}`,
        threadId: input.threadId ?? engine.id,
        title: asset.name,
        status: "delivered",
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
      message: `Asset created: ${asset.name}${asset.file ? ` (${asset.file.fileName})` : ""}`,
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

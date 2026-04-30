/**
 * POST /api/v2/assets/diff
 *
 * Compare 2 assets et retourne un diff sémantique synthétisé via Claude.
 * Body : { assetIdA, assetIdB }
 * Return : { summary, differences: Array<{ kind, description }> }
 *
 * Fail-soft : si Anthropic n'est pas configuré ou crash, on retombe sur
 * un diff naïf (titres + tailles contentRef) plutôt que de renvoyer une
 * 500.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { loadAssetById, type Asset } from "@/lib/assets/types";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  assetIdA: z.string().min(1),
  assetIdB: z.string().min(1),
});

interface DiffEntry {
  kind: string;
  description: string;
}

interface DiffResult {
  summary: string;
  differences: DiffEntry[];
}

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/assets/diff",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { assetIdA, assetIdB } = parsed.data;

  const [a, b] = await Promise.all([
    loadAssetById(assetIdA, { tenantId: scope.tenantId, workspaceId: scope.workspaceId }),
    loadAssetById(assetIdB, { tenantId: scope.tenantId, workspaceId: scope.workspaceId }),
  ]);

  if (!a || !b) {
    return NextResponse.json(
      { error: "asset_not_found", message: "Un des assets est introuvable ou hors scope." },
      { status: 404 },
    );
  }

  // Fallback déterministe si pas de clé Anthropic
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(naiveDiff(a, b));
  }

  try {
    const result = await llmDiff(a, b);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/v2/assets/diff] llm error:", err);
    return NextResponse.json(naiveDiff(a, b));
  }
}

function naiveDiff(a: Asset, b: Asset): DiffResult {
  const diffs: DiffEntry[] = [];
  if (a.title !== b.title) {
    diffs.push({ kind: "title", description: `« ${a.title} » → « ${b.title} »` });
  }
  if ((a.kind ?? "") !== (b.kind ?? "")) {
    diffs.push({ kind: "kind", description: `${a.kind} → ${b.kind}` });
  }
  const sizeA = a.contentRef?.length ?? 0;
  const sizeB = b.contentRef?.length ?? 0;
  if (sizeA !== sizeB) {
    diffs.push({
      kind: "content_size",
      description: `${sizeA} chars → ${sizeB} chars (${sizeB - sizeA >= 0 ? "+" : ""}${sizeB - sizeA})`,
    });
  }
  if ((a.provenance?.modelUsed ?? "") !== (b.provenance?.modelUsed ?? "")) {
    diffs.push({
      kind: "model",
      description: `${a.provenance?.modelUsed ?? "?"} → ${b.provenance?.modelUsed ?? "?"}`,
    });
  }
  return {
    summary: `Comparaison déterministe entre « ${a.title} » et « ${b.title} » (LLM indisponible).`,
    differences: diffs,
  };
}

async function llmDiff(a: Asset, b: Asset): Promise<DiffResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const contentA = (a.contentRef ?? a.summary ?? "").slice(0, 6000);
  const contentB = (b.contentRef ?? b.summary ?? "").slice(0, 6000);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "Tu es un assistant qui compare deux assets Hearst OS et retourne un diff sémantique structuré. " +
      "Réponds STRICTEMENT en JSON valide avec la forme : " +
      `{"summary": "...", "differences": [{"kind": "...", "description": "..."}]}. ` +
      "Le summary fait 1-2 phrases en français. Chaque difference.kind est un slug court (ex: 'title', 'tone', 'metrics', 'sources'). " +
      "Limite-toi à 6 différences principales. Pas de markdown, pas de prose hors JSON.",
    messages: [
      {
        role: "user",
        content:
          `Asset A — Titre: ${a.title}\nKind: ${a.kind}\nContenu (tronqué):\n${contentA}\n\n` +
          `Asset B — Titre: ${b.title}\nKind: ${b.kind}\nContenu (tronqué):\n${contentB}`,
      },
    ],
  });

  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  // Extrait le premier JSON object — Claude peut wrap en ```json ... ```
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM did not return JSON");
  }
  const parsed = JSON.parse(jsonMatch[0]) as Partial<DiffResult>;
  if (!parsed.summary || !Array.isArray(parsed.differences)) {
    throw new Error("LLM JSON missing required fields");
  }
  return {
    summary: String(parsed.summary),
    differences: parsed.differences
      .filter((d): d is DiffEntry => Boolean(d) && typeof d.kind === "string" && typeof d.description === "string")
      .slice(0, 8),
  };
}

/**
 * POST /api/v2/assets/[id]/variants — Demande la génération d'un variant.
 *
 * Phase B.1 : kind="audio" (TTS via ElevenLabs).
 * Phase B suivante : video, slides, site, image.
 *
 * Le flow :
 *  1. Auth + load asset (ownership check via RLS user-scoped)
 *  2. Estimate cost (selon kind + paramètres)
 *  3. requireCreditsForJob → reserve_credits()
 *  4. createVariant(assetId, kind, "pending")
 *  5. enqueueJob(audio-gen) avec variantId dans payload
 *  6. Return { variantId, jobId }
 *
 * Le worker pickup, génère, upload storage, update variant status="ready",
 * settle credits avec coût réel. Le client poll GET .../variants pour voir
 * le statut (Phase B.1+ : SSE progress endpoint).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { loadAssetById } from "@/lib/assets/types";
import { createVariant, getVariantsForAsset, updateVariant } from "@/lib/assets/variants";
import { estimateSpeechCost } from "@/lib/capabilities/providers/elevenlabs";
import { requireCreditsForJob, formatInsufficientCreditsMessage } from "@/lib/credits/middleware";
import { settleCredits } from "@/lib/credits/client";
import { enqueueJob } from "@/lib/jobs/queue";
import type { AudioGenInput, VideoGenInput, JobKind } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await ctx.params;

  const { scope, error: scopeError } = await requireScope({ context: "POST /api/v2/assets/[id]/variants" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  let body: { kind: "audio" | "video" | "slides" | "site" | "image"; text?: string; voiceId?: string; modelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.kind !== "audio") {
    // V1 Phase B.1 : audio uniquement. Les autres kinds arrivent en Phase B suivantes.
    return NextResponse.json({ error: "kind_not_supported_yet", kind: body.kind }, { status: 400 });
  }

  // Load asset and check ownership (RLS bypassed côté server, on filtre manuellement).
  const asset = await loadAssetById(assetId, { tenantId: scope.tenantId, workspaceId: scope.workspaceId });
  if (!asset) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }

  const text = (body.text ?? asset.summary ?? asset.title).trim();
  if (text.length === 0) {
    return NextResponse.json({ error: "no_text_to_synthesize" }, { status: 400 });
  }

  // Idempotence légère : si un variant audio est déjà ready ou en cours, retour direct.
  const existing = await getVariantsForAsset(assetId);
  const audioActive = existing.find((v) => v.kind === "audio" && (v.status === "ready" || v.status === "generating" || v.status === "pending"));
  if (audioActive) {
    return NextResponse.json({
      variantId: audioActive.id,
      jobId: audioActive.jobId,
      status: audioActive.status,
      reused: true,
    });
  }

  const estimatedCostUsd = estimateSpeechCost(text, body.modelId);
  const placeholderJobId = `pending-${assetId}-${Date.now()}`;

  // Reserve credits BEFORE enqueueing (atomic via SQL fn).
  const guard = await requireCreditsForJob({
    userId: scope.userId,
    tenantId: scope.tenantId,
    jobKind: "audio-gen",
    estimatedCostUsd,
    jobId: placeholderJobId,
  });
  if (!guard.allowed) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: formatInsufficientCreditsMessage(guard, "audio-gen"),
        availableUsd: guard.availableUsd,
        estimatedCostUsd: guard.estimatedCostUsd,
      },
      { status: 402 },
    );
  }

  const variantId = await createVariant({
    assetId,
    kind: "audio",
    status: "pending",
    provider: "elevenlabs",
  });
  if (!variantId) {
    return NextResponse.json({ error: "variant_create_failed" }, { status: 500 });
  }

  const payload: AudioGenInput & { variantId: string } = {
    jobKind: "audio-gen",
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    assetId,
    estimatedCostUsd,
    text,
    voiceId: body.voiceId,
    modelId: body.modelId,
    variantKind: "audio",
    variantId,
  };

  try {
    const result = await enqueueJob(payload);
    return NextResponse.json({
      variantId,
      jobId: result.jobId,
      status: "pending",
      estimatedCostUsd,
    });
  } catch (err) {
    // Enqueue échoué (Redis down, queue saturée…) : on doit cleanup les
    // deux réservations laissées derrière par les étapes précédentes,
    // sinon double fuite : (1) crédits réservés bloqués, (2) variant
    // pending fantôme dans la liste utilisateur.
    console.error("[Variants] enqueue failed:", err);

    const errorMessage = err instanceof Error ? err.message : String(err);

    // 1. Refund total : reserved restent, actual=0 → balance reste intacte
    //    et reserved repasse à 0 (cf. settle_credits dans 0029).
    await settleCredits({
      userId: scope.userId,
      tenantId: scope.tenantId,
      reservedUsd: estimatedCostUsd,
      actualUsd: 0,
      jobId: placeholderJobId,
      jobKind: "audio-gen",
      description: `enqueue_failed: ${errorMessage.slice(0, 200)}`,
    }).catch((settleErr) => {
      // Si le refund lui-même échoue, on log mais on continue à répondre.
      console.error("[Variants] settle_credits refund failed:", settleErr);
    });

    // 2. Marquer le variant comme failed pour que le polling client
    //    sorte de l'état pending et que la liste reflète la réalité.
    await updateVariant(variantId, {
      status: "failed",
      error: `enqueue_failed: ${errorMessage.slice(0, 500)}`,
      metadata: { reason: "enqueue_failed", message: errorMessage },
    }).catch((updateErr) => {
      console.error("[Variants] updateVariant failed→failed status update failed:", updateErr);
    });

    return NextResponse.json(
      { error: "enqueue_failed", message: errorMessage },
      { status: 503 },
    );
  }
}

/**
 * GET /api/v2/assets/[id]/variants — liste les variants d'un asset.
 * Le client poll cet endpoint pour voir status pending → ready.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await ctx.params;

  const { scope, error: scopeError } = await requireScope({ context: "GET /api/v2/assets/[id]/variants" });
  if (scopeError || !scope) {
    return NextResponse.json({ error: scopeError?.message ?? "not_authenticated" }, { status: scopeError?.status ?? 401 });
  }

  const asset = await loadAssetById(assetId, { tenantId: scope.tenantId, workspaceId: scope.workspaceId });
  if (!asset) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }

  const variants = await getVariantsForAsset(assetId);
  return NextResponse.json({ variants });
}

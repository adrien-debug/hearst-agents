/**
 * GET /api/reports/[reportId]/export?format=pdf|xlsx|csv
 *
 * Export "à la demande" d'un report (asset kind=report) :
 *   1. Vérifie l'auth + la propriété de l'asset (tenant + user).
 *   2. Charge le RenderPayload depuis assets.content_ref (sérialisé en JSON).
 *   3. Génère le binaire via exportPdf / exportXlsx / exportCsv.
 *   4. Stream en réponse avec Content-Disposition: attachment.
 *
 * On ne touche PAS à `report_exports` ici — la persistence est réservée aux
 * exports automatisés (mission-job.ts). Cet endpoint est l'export "manuel"
 * one-shot, le binaire ne survit pas à la requête.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { exportPdf } from "@/lib/reports/export/pdf";
import { exportXlsx } from "@/lib/reports/export/xlsx";
import { exportCsv } from "@/lib/reports/export/csv";
import type { ExportInput } from "@/lib/reports/export/types";
import { getCatalogEntry } from "@/lib/reports/catalog";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const formatSchema = z.enum(["pdf", "xlsx", "csv"]);

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

interface AssetPayloadEnvelope {
  __reportPayload?: boolean;
  payload?: unknown;
  narration?: string | null;
}

function unwrapPayload(
  raw: string,
): { payload: RenderPayload; narration: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  // Cas 1 — le contentRef est directement le RenderPayload sérialisé (avec un
  // champ supplémentaire "narration" coexistant — c'est ce que fait actuellement
  // /api/v2/reports/[specId]/run).
  const flat = parsed as RenderPayload & { narration?: string | null };
  if (flat.__reportPayload === true) {
    return {
      payload: {
        __reportPayload: true,
        specId: flat.specId,
        version: flat.version,
        generatedAt: flat.generatedAt,
        blocks: flat.blocks,
        scalars: flat.scalars,
      },
      narration: flat.narration ?? null,
    };
  }

  // Cas 2 — wrapper { payload, narration }
  const env = parsed as AssetPayloadEnvelope;
  const inner = env.payload as RenderPayload | undefined;
  if (inner && inner.__reportPayload === true) {
    return { payload: inner, narration: env.narration ?? null };
  }
  return null;
}

function fallbackMeta(title: string): ReportMeta {
  return {
    title,
    summary: "",
    domain: "mixed",
    persona: "founder",
    cadence: "ad-hoc",
    confidentiality: "internal",
  };
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { reportId } = await ctx.params;
  const url = new URL(req.url);
  const formatParsed = formatSchema.safeParse(url.searchParams.get("format") ?? "pdf");
  if (!formatParsed.success) {
    return NextResponse.json(
      { error: "invalid_format", allowed: ["pdf", "xlsx", "csv"] },
      { status: 400 },
    );
  }
  const format = formatParsed.data;

  const { scope, error } = await requireScope({
    context: `GET /api/reports/${reportId}/export`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const { data: asset, error: fetchErr } = await sb
    .from("assets")
    .select("id, kind, title, summary, content_ref, provenance")
    .eq("id", reportId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!asset || asset.kind !== "report") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const provenance = (asset.provenance ?? {}) as Record<string, unknown>;
  if (
    provenance.userId !== undefined &&
    provenance.userId !== scope.userId
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (typeof asset.content_ref !== "string" || !asset.content_ref) {
    return NextResponse.json({ error: "no_content" }, { status: 404 });
  }
  const unwrapped = unwrapPayload(asset.content_ref);
  if (!unwrapped) {
    return NextResponse.json({ error: "payload_invalid" }, { status: 422 });
  }

  // Reconstruit ReportMeta : on pioche dans le catalogue si specId connu,
  // sinon on bâtit un meta minimal à partir du titre/summary de l'asset.
  let meta: ReportMeta;
  const specId = (provenance.specId as string | undefined) ?? unwrapped.payload.specId;
  const cat = specId ? getCatalogEntry(specId) : null;
  if (cat) {
    // Construit le Spec parametré pour récupérer un ReportMeta valide
    try {
      const tmpSpec = cat.build({
        tenantId: (provenance.tenantId as string | undefined) ?? scope.tenantId,
        workspaceId: (provenance.workspaceId as string | undefined) ?? scope.workspaceId,
        userId: scope.userId,
      });
      meta = { ...tmpSpec.meta, title: asset.title ?? tmpSpec.meta.title, summary: asset.summary ?? tmpSpec.meta.summary };
    } catch {
      meta = fallbackMeta(asset.title ?? "Rapport");
    }
  } else {
    meta = fallbackMeta(asset.title ?? "Rapport");
    if (asset.summary) meta = { ...meta, summary: asset.summary };
  }

  const exportInput: ExportInput = {
    payload: unwrapped.payload,
    meta,
    narration: unwrapped.narration,
    fileName: meta.title,
  };

  let result;
  try {
    result =
      format === "pdf" ? await exportPdf(exportInput)
      : format === "xlsx" ? await exportXlsx(exportInput)
      : await exportCsv(exportInput);
  } catch (err) {
    console.error(`[reports/export] generation failed (${format}):`, err);
    return NextResponse.json(
      { error: "generation_failed" },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": String(result.size),
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * GET /api/v2/daily-brief/history?limit=7
 *
 * Liste les briefs précédents de l'utilisateur (assets kind="daily_brief"),
 * triés par created_at DESC. Utilisé par BriefingPage pour afficher la
 * sidebar history.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional().default(7),
});

interface AssetRowSlim {
  id: string;
  title: string | null;
  summary: string | null;
  content_ref: string | null;
  created_at: string;
  provenance: Record<string, unknown> | null;
}

interface BriefHistoryItem {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  targetDate: string | null;
  pdfUrl: string | null;
}

function extractContentRefMeta(contentRef: string | null): {
  targetDate: string | null;
  pdfUrl: string | null;
} {
  if (!contentRef) return { targetDate: null, pdfUrl: null };
  try {
    const parsed = JSON.parse(contentRef) as {
      meta?: { targetDate?: string; pdfUrl?: string | null };
    };
    return {
      targetDate: parsed.meta?.targetDate ?? null,
      pdfUrl: parsed.meta?.pdfUrl ?? null,
    };
  } catch {
    return { targetDate: null, pdfUrl: null };
  }
}

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/daily-brief/history",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const limit = parsed.data.limit;

  try {
    const sb = requireServerSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("assets" as any) as any)
      .select("id, title, summary, content_ref, created_at, provenance")
      .eq("kind", "daily_brief")
      .eq("provenance->>userId", scope.userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const briefs: BriefHistoryItem[] = ((data ?? []) as AssetRowSlim[]).map((row) => {
      const meta = extractContentRefMeta(row.content_ref);
      return {
        id: row.id,
        title: row.title ?? "Brief du jour",
        summary: row.summary ?? "",
        createdAt: row.created_at,
        targetDate: meta.targetDate,
        pdfUrl: meta.pdfUrl,
      };
    });

    return NextResponse.json({ briefs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-brief/history] failed:", message);
    return NextResponse.json({ error: "history_failed", message }, { status: 500 });
  }
}

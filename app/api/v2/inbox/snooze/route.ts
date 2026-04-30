/**
 * POST /api/v2/inbox/snooze
 *
 * Snooze un item de la dernière inbox brief jusqu'à demain 8h (par défaut).
 * Re-store un nouvel asset inbox_brief avec snoozedUntil mis à jour sur l'item.
 *
 * Body : { itemId: string, until?: number (timestamp ms) }
 * Return : { ok, assetId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { snoozeInboxItem } from "@/lib/inbox/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  itemId: z.string().min(1),
  until: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/inbox/snooze" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
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

  try {
    const result = await snoozeInboxItem({
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      itemId: parsed.data.itemId,
      until: parsed.data.until,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "snooze_failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, assetId: result.assetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/inbox/snooze] failed:", message);
    return NextResponse.json({ ok: false, error: "internal_error", message }, { status: 500 });
  }
}

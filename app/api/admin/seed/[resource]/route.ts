import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/app/api/admin/_helpers";
import { runSeed, type SeedResource } from "@/lib/admin/seed";

export const dynamic = "force-dynamic";

const VALID: SeedResource[] = ["agents", "tools", "datasets", "workflows", "skills", "all"];

export async function POST(
  _req: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  if (!VALID.includes(resource as SeedResource)) {
    return NextResponse.json(
      { error: "invalid_resource", allowed: VALID },
      { status: 400 },
    );
  }

  const guard = await requireAdmin(`POST /api/admin/seed/${resource}`, {
    resource: "settings",
    action: "update",
  });
  if (isError(guard)) return guard;

  try {
    const reports = await runSeed(guard.db, resource as SeedResource);
    const totals = reports.reduce(
      (acc, r) => ({
        inserted: acc.inserted + r.inserted,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { inserted: 0, skipped: 0, errors: 0 },
    );
    return NextResponse.json({ ok: true, totals, reports });
  } catch (e) {
    console.error("[Admin API] seed error:", e);
    return NextResponse.json({ error: "seed_failed" }, { status: 500 });
  }
}

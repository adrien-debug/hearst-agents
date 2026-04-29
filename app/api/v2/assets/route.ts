import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { storeAsset, loadAssetsForScope, type Asset, type AssetKind } from "@/lib/assets/types";

export const dynamic = "force-dynamic";

// Validation schema for creating an asset.
const createAssetSchema = z.object({
  type: z.enum(["pdf", "excel", "doc", "json", "csv", "report", "text"]),
  name: z.string().min(1).max(200),
  run_id: z.string().optional(),
  url: z.string().url().optional(),
  threadId: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
});

// Mapping de l'enum exposé par l'API (compat) vers le `kind` canonique V2.
function typeToKind(type: z.infer<typeof createAssetSchema>["type"]): AssetKind {
  const mapping: Record<typeof type, AssetKind> = {
    pdf: "document",
    excel: "spreadsheet",
    doc: "document",
    json: "document",
    csv: "spreadsheet",
    report: "report",
    text: "message",
  };
  return mapping[type];
}

/**
 * GET /api/v2/assets
 * List all assets for the current user/tenant/workspace scope.
 * Query params: offset, limit, type, search.
 */
export async function GET(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "GET /api/v2/assets" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const typeFilter = url.searchParams.get("type");
  const searchQuery = url.searchParams.get("search")?.toLowerCase();

  try {
    // Canonical source : Supabase, via loadAssetsForScope (V2). Format
    // retourné : Asset V2 (`kind`, `title`, `createdAt`, etc.).
    // Les consumers client s'adaptent à ces champs depuis le 29/04/2026.
    const allAssets = await loadAssetsForScope({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      limit: 1000,
    });

    let filtered = allAssets;

    if (typeFilter && typeFilter !== "all") {
      filtered = filtered.filter((a) => a.kind === typeFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter((a) =>
        a.title.toLowerCase().includes(searchQuery),
      );
    }

    const total = filtered.length;
    const paginatedAssets = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      assets: paginatedAssets,
      pagination: { offset, limit, total },
      source: allAssets.length > 0 ? "database" : "empty",
      scope: { isDevFallback: scope.isDevFallback },
    });
  } catch (e) {
    console.error("GET /api/v2/assets: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * POST /api/v2/assets
 *
 * Crée un asset via le seul chemin de persistance V2 (`storeAsset` de
 * `lib/assets/types.ts`) — in-memory cache **et** Supabase DB en un seul
 * appel. Avant : double écriture `createAsset+storeAsset (runtime)` ET
 * `saveAsset (adapter)` ; supprimée le 29/04/2026.
 */
export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/assets" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = createAssetSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "validation_error", details: result.error.format() },
      { status: 400 },
    );
  }

  const { type, name, run_id, url, threadId, metadata } = result.data;

  const asset: Asset = {
    id: randomUUID(),
    threadId: threadId ?? (metadata?.threadId as string | undefined) ?? "default",
    kind: typeToKind(type),
    title: name,
    summary: metadata?.summary as string | undefined,
    provenance: {
      providerId: "system",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      runArtifact: false,
      // Préserve le runtime type pour le round-trip — sans ça, `doc` /
      // `json` / `csv` reviennent en `pdf` / `excel` après le mapping
      // bidirectionnel kind ↔ type de l'adapter.
      type,
    },
    createdAt: Date.now(),
    contentRef: url ?? (metadata?.content as string | undefined),
    runId: run_id || undefined,
  };

  storeAsset(asset);

  console.log(
    `[POST /api/v2/assets] Created asset: ${asset.id} (${type} → ${asset.kind}) for user ${scope.userId.slice(0, 8)}`,
  );

  return NextResponse.json(
    {
      asset,
      success: true,
      scope: { isDevFallback: scope.isDevFallback },
    },
    { status: 201 },
  );
}

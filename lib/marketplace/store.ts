/**
 * Marketplace store — CRUD Supabase pour les templates publics partagés.
 *
 * Fail-soft : si Supabase est indisponible, listTemplates renvoie [] et toutes
 * les écritures renvoient { ok: false }. Aucune erreur ne remonte aux callers.
 *
 * Validation systématique du payload selon kind, à la publication ET au
 * chargement (defense-in-depth).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { saveTemplate as saveReportTemplate } from "@/lib/reports/templates/store";
import { createPersona } from "@/lib/personas/store";
import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { saveScheduledMission } from "@/lib/engine/runtime/state/adapter";
import {
  validatePayload,
  tagsSchema,
  MARKETPLACE_KINDS,
  type MarketplaceKind,
  type MarketplaceTemplate,
  type MarketplaceTemplateSummary,
  type MarketplaceRating,
  type PublishTemplateInput,
  type ListTemplatesInput,
  type CloneResult,
  type PersonaPayload,
} from "./types";

// ── Row Supabase (snake_case, untyped — table absente de Database). ─

interface TemplateRow {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  payload: unknown;
  author_user_id: string;
  author_tenant_id: string;
  author_display_name: string | null;
  tags: string[] | null;
  rating_avg: number | string;
  rating_count: number;
  clone_count: number;
  is_featured: boolean;
  is_archived: boolean;
  created_at: string;
  updatedAt?: string;
  updated_at: string;
}

function rowToSummary(row: TemplateRow): MarketplaceTemplateSummary {
  return {
    id: row.id,
    kind: row.kind as MarketplaceKind,
    title: row.title,
    description: row.description ?? null,
    authorDisplayName: row.author_display_name ?? null,
    authorTenantId: row.author_tenant_id,
    tags: row.tags ?? [],
    ratingAvg: typeof row.rating_avg === "string" ? Number(row.rating_avg) : row.rating_avg,
    ratingCount: row.rating_count,
    cloneCount: row.clone_count,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTemplate(row: TemplateRow): MarketplaceTemplate | null {
  if (!MARKETPLACE_KINDS.includes(row.kind as MarketplaceKind)) {
    console.warn(`[marketplace/store] kind inconnu pour ${row.id}: ${row.kind}`);
    return null;
  }
  const validation = validatePayload(row.kind as MarketplaceKind, row.payload);
  if (!validation.ok) {
    console.warn(
      `[marketplace/store] payload invalide pour ${row.id} (${row.kind}): ${validation.error}`,
    );
    return null;
  }
  return {
    ...rowToSummary(row),
    authorUserId: row.author_user_id,
    payload: validation.data,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(client: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from as any)("marketplace_templates");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ratingsTable(client: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from as any)("marketplace_ratings");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reportsTable(client: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.from as any)("marketplace_reports");
}

// ── publishTemplate ─────────────────────────────────────────

export async function publishTemplate(
  input: PublishTemplateInput,
  client?: SupabaseClient,
): Promise<MarketplaceTemplate | null> {
  if (!MARKETPLACE_KINDS.includes(input.kind)) {
    console.warn("[marketplace/store] publish: kind invalide");
    return null;
  }
  if (!input.title || input.title.length > 120) {
    console.warn("[marketplace/store] publish: title invalide");
    return null;
  }

  const payloadCheck = validatePayload(input.kind, input.payload);
  if (!payloadCheck.ok) {
    console.warn(`[marketplace/store] publish: payload invalide — ${payloadCheck.error}`);
    return null;
  }

  const tagsParsed = tagsSchema.safeParse(input.tags ?? []);
  if (!tagsParsed.success) {
    console.warn("[marketplace/store] publish: tags invalides");
    return null;
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { data, error } = await table(sb)
    .insert({
      kind: input.kind,
      title: input.title.slice(0, 120),
      description: input.description ? input.description.slice(0, 500) : null,
      payload: payloadCheck.data,
      author_user_id: input.authorUserId,
      author_tenant_id: input.authorTenantId,
      author_display_name: input.authorDisplayName ?? null,
      tags: tagsParsed.data,
    })
    .select()
    .single();

  if (error) {
    console.error("[marketplace/store] publish error:", error.message);
    return null;
  }
  return rowToTemplate(data as TemplateRow);
}

// ── listTemplates ───────────────────────────────────────────

export async function listTemplates(
  input: ListTemplatesInput = {},
  client?: SupabaseClient,
): Promise<MarketplaceTemplateSummary[]> {
  const sb = client ?? getServerSupabase();
  if (!sb) return [];

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  let query = table(sb)
    .select(
      "id, kind, title, description, author_user_id, author_tenant_id, author_display_name, tags, rating_avg, rating_count, clone_count, is_featured, is_archived, created_at, updated_at",
    )
    .eq("is_archived", false)
    .order("is_featured", { ascending: false })
    .order("clone_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (input.kind) query = query.eq("kind", input.kind);
  if (input.featured) query = query.eq("is_featured", true);
  if (input.tags && input.tags.length > 0) {
    query = query.contains("tags", input.tags);
  }
  if (input.q && input.q.trim().length > 0) {
    const term = input.q.trim().replace(/[%_]/g, "");
    query = query.or(
      `title.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[marketplace/store] list error:", error.message);
    return [];
  }
  return (data ?? []).map((row: TemplateRow) => rowToSummary(row));
}

// ── getTemplate ─────────────────────────────────────────────

export async function getTemplate(
  id: string,
  client?: SupabaseClient,
): Promise<MarketplaceTemplate | null> {
  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { data, error } = await table(sb)
    .select("*")
    .eq("id", id)
    .eq("is_archived", false)
    .maybeSingle();

  if (error) {
    console.error("[marketplace/store] get error:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToTemplate(data as TemplateRow);
}

// ── archiveTemplate (soft delete owner-only) ────────────────

export async function archiveTemplate(
  id: string,
  authorUserId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  const sb = client ?? getServerSupabase();
  if (!sb) return false;

  const { error } = await table(sb)
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("author_user_id", authorUserId);

  if (error) {
    console.error("[marketplace/store] archive error:", error.message);
    return false;
  }
  return true;
}

// ── cloneTemplate ───────────────────────────────────────────

export async function cloneTemplate(
  id: string,
  targetUserId: string,
  targetTenantId: string,
  targetWorkspaceId: string,
  client?: SupabaseClient,
): Promise<CloneResult> {
  const sb = client ?? getServerSupabase();
  if (!sb) return { ok: false, error: "supabase_unavailable" };

  const tpl = await getTemplate(id, sb);
  if (!tpl) return { ok: false, error: "template_not_found" };

  let resourceId: string | undefined;

  try {
    if (tpl.kind === "workflow") {
      const graph = tpl.payload as WorkflowGraph;
      const mission = createScheduledMission({
        name: tpl.title,
        input: tpl.title,
        schedule: extractCronFromGraph(graph) ?? "manual",
        tenantId: targetTenantId,
        workspaceId: targetWorkspaceId,
        userId: targetUserId,
        workflowGraph: graph,
      });
      addMission(mission);
      await saveScheduledMission({
        id: mission.id,
        tenantId: mission.tenantId,
        workspaceId: mission.workspaceId,
        userId: mission.userId,
        name: mission.name,
        input: mission.input,
        schedule: mission.schedule,
        enabled: mission.enabled,
        createdAt: mission.createdAt,
        workflowGraph: graph,
      });
      resourceId = mission.id;
    } else if (tpl.kind === "report_spec") {
      const spec = tpl.payload as ReportSpec;
      const sealedSpec: ReportSpec = {
        ...spec,
        scope: {
          tenantId: targetTenantId,
          workspaceId: targetWorkspaceId,
          userId: targetUserId,
        },
      };
      const saved = await saveReportTemplate(
        {
          tenantId: targetTenantId,
          userId: targetUserId,
          name: tpl.title,
          description: tpl.description ?? undefined,
          spec: sealedSpec,
          isPublic: false,
        },
        sb,
      );
      if (!saved) return { ok: false, error: "save_failed" };
      resourceId = saved.id;
    } else if (tpl.kind === "persona") {
      const p = tpl.payload as PersonaPayload;
      const persona = await createPersona({
        userId: targetUserId,
        tenantId: targetTenantId,
        name: p.name,
        description: p.description,
        tone: p.tone ?? null,
        vocabulary: p.vocabulary ?? null,
        styleGuide: p.styleGuide ?? null,
        systemPromptAddon: p.systemPromptAddon ?? null,
        surface: p.surface ?? null,
        isDefault: false,
      });
      resourceId = persona.id;
    } else {
      return { ok: false, error: "unknown_kind" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "clone_failed";
    return { ok: false, error: msg };
  }

  // Increment compteur (best-effort, non-bloquant).
  await incrementCloneCount(id, sb);

  return { ok: true, resourceId };
}

async function incrementCloneCount(
  id: string,
  client: SupabaseClient,
): Promise<void> {
  // Lecture + écriture (pas de RPC dispo). Race possible mais MVP.
  const { data } = await table(client)
    .select("clone_count")
    .eq("id", id)
    .maybeSingle();
  const current = data ? Number((data as { clone_count: number }).clone_count) || 0 : 0;
  await table(client)
    .update({ clone_count: current + 1, updated_at: new Date().toISOString() })
    .eq("id", id);
}

function extractCronFromGraph(graph: WorkflowGraph): string | null {
  const start = graph.nodes.find((n) => n.id === graph.startNodeId);
  const cron = start?.config?.cron;
  return typeof cron === "string" && cron.trim() ? cron : null;
}

// ── rateTemplate ────────────────────────────────────────────

export async function rateTemplate(
  templateId: string,
  userId: string,
  rating: number,
  comment?: string,
  client?: SupabaseClient,
): Promise<boolean> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;
  const sb = client ?? getServerSupabase();
  if (!sb) return false;

  const { error } = await ratingsTable(sb).upsert(
    {
      template_id: templateId,
      user_id: userId,
      rating,
      comment: comment ? comment.slice(0, 500) : null,
    },
    { onConflict: "template_id,user_id" },
  );

  if (error) {
    console.error("[marketplace/store] rate error:", error.message);
    return false;
  }

  // Source de vérité = trigger SQL `marketplace_ratings_recalc` (cf
  // supabase/migrations/0054_marketplace_templates.sql) qui recalcule
  // rating_avg / rating_count après chaque INSERT/UPDATE/DELETE sur
  // marketplace_ratings. Le fallback applicatif ci-dessous reste en place
  // uniquement pour les environnements de dev où le trigger n'a pas été
  // appliqué (ex: setup local sans migration). En prod, le trigger l'emporte
  // — l'écriture supplémentaire est idempotente.
  await recalcRatingFallback(templateId, sb);

  return true;
}

async function recalcRatingFallback(
  templateId: string,
  client: SupabaseClient,
): Promise<void> {
  const { data, error } = await ratingsTable(client)
    .select("rating")
    .eq("template_id", templateId);
  if (error || !data) return;
  const rows = data as Array<{ rating: number }>;
  const count = rows.length;
  const avg = count === 0
    ? 0
    : Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 100) / 100;
  await table(client)
    .update({
      rating_avg: avg,
      rating_count: count,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);
}

// ── listRatings ─────────────────────────────────────────────

export async function listRatings(
  templateId: string,
  client?: SupabaseClient,
): Promise<MarketplaceRating[]> {
  const sb = client ?? getServerSupabase();
  if (!sb) return [];

  const { data, error } = await ratingsTable(sb)
    .select("template_id, user_id, rating, comment, created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[marketplace/store] list ratings error:", error.message);
    return [];
  }
  return (data ?? []).map((r: {
    template_id: string;
    user_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  }) => ({
    templateId: r.template_id,
    userId: r.user_id,
    rating: r.rating,
    comment: r.comment ?? null,
    createdAt: r.created_at,
  }));
}

// ── reportTemplate (signalement abuse) ──────────────────────

export async function reportTemplate(
  templateId: string,
  reporterUserId: string,
  reason: string,
  client?: SupabaseClient,
): Promise<boolean> {
  if (!reason || reason.length > 500) return false;
  const sb = client ?? getServerSupabase();
  if (!sb) return false;

  const { error } = await reportsTable(sb).insert({
    template_id: templateId,
    reporter_user_id: reporterUserId,
    reason: reason.slice(0, 500),
  });

  if (error) {
    console.error("[marketplace/store] report error:", error.message);
    return false;
  }
  return true;
}

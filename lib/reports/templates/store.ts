/**
 * report_templates store — CRUD Supabase pour les templates de rapports.
 *
 * Toutes les fonctions retournent null / [] quand Supabase n'est pas configuré
 * (dev sans env). Les callers (API routes) traduisent en erreur HTTP.
 *
 * La validation Zod du spec JSONB est appliquée systématiquement au chargement
 * pour garantir l'intégrité même si la DB contient des données antérieures.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import {
  saveTemplateInputSchema,
  loadTemplateInputSchema,
  listTemplatesInputSchema,
  deleteTemplateInputSchema,
  updateTemplateInputSchema,
  type Template,
  type TemplateSummary,
  type SaveTemplateInput,
  type LoadTemplateInput,
  type ListTemplatesInput,
  type DeleteTemplateInput,
  type UpdateTemplateInput,
} from "./schema";

// ── Row Supabase (snake_case) ───────────────────────────────

interface TemplateRow {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  description: string | null;
  domain: string;
  spec: unknown;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): Template | null {
  // Revalide le spec JSONB à chaque chargement.
  const parsed = reportSpecSchema.safeParse(row.spec);
  if (!parsed.success) {
    console.error(
      `[templates] spec invalide pour template ${row.id}: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    name: row.name,
    description: row.description ?? undefined,
    domain: row.domain,
    spec: parsed.data,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSummary(row: TemplateRow): TemplateSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    name: row.name,
    description: row.description ?? undefined,
    domain: row.domain,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── saveTemplate ─────────────────────────────────────────────

export async function saveTemplate(
  input: SaveTemplateInput,
  client?: SupabaseClient,
): Promise<Template | null> {
  const validated = saveTemplateInputSchema.safeParse(input);
  if (!validated.success) {
    console.error("[templates] saveTemplate input invalide:", validated.error.issues[0]?.message);
    return null;
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { tenantId, userId, name, description, spec, isPublic } = validated.data;

  const { data, error } = await sb
    .from("report_templates")
    .insert({
      tenant_id: tenantId,
      created_by: userId,
      name,
      description: description ?? null,
      domain: spec.meta.domain,
      spec: spec as unknown as Record<string, unknown>,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) {
    console.error("[templates] saveTemplate error:", error.message);
    return null;
  }
  return rowToTemplate(data as TemplateRow);
}

// ── loadTemplate ─────────────────────────────────────────────

export async function loadTemplate(
  input: LoadTemplateInput,
  client?: SupabaseClient,
): Promise<ReportSpec | null> {
  const validated = loadTemplateInputSchema.safeParse(input);
  if (!validated.success) {
    console.error("[templates] loadTemplate input invalide:", validated.error.issues[0]?.message);
    return null;
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { templateId, tenantId } = validated.data;

  const { data, error } = await sb
    .from("report_templates")
    .select("*")
    .eq("id", templateId)
    .or(`tenant_id.eq.${tenantId},is_public.eq.true`)
    .maybeSingle();

  if (error) {
    console.error("[templates] loadTemplate error:", error.message);
    return null;
  }
  if (!data) return null;

  const template = rowToTemplate(data as TemplateRow);
  return template?.spec ?? null;
}

// ── listTemplates ─────────────────────────────────────────────

export async function listTemplates(
  input: ListTemplatesInput,
  client?: SupabaseClient,
): Promise<TemplateSummary[]> {
  const validated = listTemplatesInputSchema.safeParse(input);
  if (!validated.success) {
    console.error("[templates] listTemplates input invalide:", validated.error.issues[0]?.message);
    return [];
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return [];

  const { tenantId, domain } = validated.data;

  let query = sb
    .from("report_templates")
    .select("id, tenant_id, created_by, name, description, domain, is_public, created_at, updated_at")
    .or(`tenant_id.eq.${tenantId},is_public.eq.true`)
    .order("created_at", { ascending: false });

  if (domain) {
    query = query.eq("domain", domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[templates] listTemplates error:", error.message);
    return [];
  }
  return (data ?? []).map((row) => rowToSummary(row as TemplateRow));
}

// ── deleteTemplate ─────────────────────────────────────────────

export async function deleteTemplate(
  input: DeleteTemplateInput,
  client?: SupabaseClient,
): Promise<void> {
  const validated = deleteTemplateInputSchema.safeParse(input);
  if (!validated.success) {
    console.error("[templates] deleteTemplate input invalide:", validated.error.issues[0]?.message);
    return;
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return;

  const { templateId, tenantId, userId } = validated.data;

  const { error } = await sb
    .from("report_templates")
    .delete()
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("created_by", userId);

  if (error) {
    console.error("[templates] deleteTemplate error:", error.message);
  }
}

// ── updateTemplate ─────────────────────────────────────────────

export async function updateTemplate(
  input: UpdateTemplateInput,
  client?: SupabaseClient,
): Promise<Template | null> {
  const validated = updateTemplateInputSchema.safeParse(input);
  if (!validated.success) {
    console.error("[templates] updateTemplate input invalide:", validated.error.issues[0]?.message);
    return null;
  }

  const sb = client ?? getServerSupabase();
  if (!sb) return null;

  const { templateId, tenantId, userId, patch } = validated.data;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.isPublic !== undefined) updatePayload.is_public = patch.isPublic;
  if (patch.spec !== undefined) {
    updatePayload.spec = patch.spec as unknown as Record<string, unknown>;
    updatePayload.domain = patch.spec.meta.domain;
  }

  const { data, error } = await sb
    .from("report_templates")
    .update(updatePayload)
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("created_by", userId)
    .select()
    .single();

  if (error) {
    console.error("[templates] updateTemplate error:", error.message);
    return null;
  }
  return rowToTemplate(data as TemplateRow);
}

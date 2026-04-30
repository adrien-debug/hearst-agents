/**
 * Personas store — CRUD scopé user_id + tenant_id sur la table `personas`.
 *
 * Fail-soft : si Supabase est indisponible (env locales sans DB), `listPersonasForUser`
 * et `getPersonaById` renvoient les valeurs in-memory builtins (lib/personas/defaults.ts)
 * pour ne jamais bloquer l'UI ni l'orchestrateur.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type {
  Persona,
  PersonaInsert,
  PersonaUpdate,
  PersonaTone,
  PersonaVocabulary,
} from "./types";
import { BUILTIN_PERSONAS } from "./defaults";

interface PersonaRow {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  tone: string | null;
  vocabulary: unknown;
  style_guide: string | null;
  system_prompt_addon: string | null;
  surface: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function rowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    tone: (row.tone as PersonaTone | null) ?? null,
    vocabulary: (row.vocabulary as PersonaVocabulary | null) ?? null,
    styleGuide: row.style_guide,
    systemPromptAddon: row.system_prompt_addon,
    surface: row.surface,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPersonasForUser(
  userId: string,
  tenantId: string,
): Promise<Persona[]> {
  const db = getServerSupabase();
  if (!db) {
    return BUILTIN_PERSONAS.map((p) => ({
      ...p,
      userId,
      tenantId,
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .select("*")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.warn("[personas/store] list failed:", error.message);
    return BUILTIN_PERSONAS.map((p) => ({ ...p, userId, tenantId }));
  }

  return ((data ?? []) as PersonaRow[]).map(rowToPersona);
}

export async function getPersonaById(
  id: string,
  scope: { userId: string; tenantId: string },
): Promise<Persona | null> {
  const builtin = BUILTIN_PERSONAS.find((p) => p.id === id);
  if (builtin) {
    return { ...builtin, userId: scope.userId, tenantId: scope.tenantId };
  }

  const db = getServerSupabase();
  if (!db) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .select("*")
    .eq("id", id)
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPersona(data as PersonaRow);
}

export async function getDefaultPersona(
  scope: { userId: string; tenantId: string },
): Promise<Persona | null> {
  const db = getServerSupabase();
  if (!db) {
    const builtin = BUILTIN_PERSONAS.find((p) => p.isDefault) ?? null;
    return builtin
      ? { ...builtin, userId: scope.userId, tenantId: scope.tenantId }
      : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .select("*")
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    const builtin = BUILTIN_PERSONAS.find((p) => p.isDefault) ?? null;
    return builtin
      ? { ...builtin, userId: scope.userId, tenantId: scope.tenantId }
      : null;
  }
  return rowToPersona(data as PersonaRow);
}

export async function getPersonaForSurface(
  surface: string,
  scope: { userId: string; tenantId: string },
): Promise<Persona | null> {
  const db = getServerSupabase();
  if (!db) {
    const builtin = BUILTIN_PERSONAS.find((p) => p.surface === surface) ?? null;
    return builtin
      ? { ...builtin, userId: scope.userId, tenantId: scope.tenantId }
      : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .select("*")
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId)
    .eq("surface", surface)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    const builtin = BUILTIN_PERSONAS.find((p) => p.surface === surface) ?? null;
    return builtin
      ? { ...builtin, userId: scope.userId, tenantId: scope.tenantId }
      : null;
  }
  return rowToPersona(data as PersonaRow);
}

export async function createPersona(input: PersonaInsert): Promise<Persona> {
  const db = getServerSupabase();
  if (!db) {
    throw new Error("personas/store: Supabase unavailable");
  }

  if (input.isDefault) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("personas" as any) as any)
      .update({ is_default: false })
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .insert({
      user_id: input.userId,
      tenant_id: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      tone: input.tone ?? null,
      vocabulary: input.vocabulary ?? null,
      style_guide: input.styleGuide ?? null,
      system_prompt_addon: input.systemPromptAddon ?? null,
      surface: input.surface ?? null,
      is_default: input.isDefault ?? false,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`personas/store: create failed: ${error.message}`);
  }
  return rowToPersona(data as PersonaRow);
}

export async function updatePersona(
  id: string,
  scope: { userId: string; tenantId: string },
  patch: PersonaUpdate,
): Promise<Persona | null> {
  const db = getServerSupabase();
  if (!db) return null;

  if (patch.isDefault === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("personas" as any) as any)
      .update({ is_default: false })
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId);
  }

  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) updateRow.name = patch.name;
  if (patch.description !== undefined) updateRow.description = patch.description;
  if (patch.tone !== undefined) updateRow.tone = patch.tone;
  if (patch.vocabulary !== undefined) updateRow.vocabulary = patch.vocabulary;
  if (patch.styleGuide !== undefined) updateRow.style_guide = patch.styleGuide;
  if (patch.systemPromptAddon !== undefined)
    updateRow.system_prompt_addon = patch.systemPromptAddon;
  if (patch.surface !== undefined) updateRow.surface = patch.surface;
  if (patch.isDefault !== undefined) updateRow.is_default = patch.isDefault;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from("personas" as any) as any)
    .update(updateRow)
    .eq("id", id)
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  return rowToPersona(data as PersonaRow);
}

export async function deletePersona(
  id: string,
  scope: { userId: string; tenantId: string },
): Promise<boolean> {
  const db = getServerSupabase();
  if (!db) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("personas" as any) as any)
    .delete()
    .eq("id", id)
    .eq("user_id", scope.userId)
    .eq("tenant_id", scope.tenantId);

  if (error) {
    console.warn("[personas/store] delete failed:", error.message);
    return false;
  }
  return true;
}

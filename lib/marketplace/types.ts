/**
 * Marketplace — types et schémas Zod.
 *
 * Trois kinds : workflow (WorkflowGraph), report_spec (ReportSpec), persona.
 * Le payload est validé à la publication selon le kind, puis stocké en JSONB
 * et revalidé au chargement (defense-in-depth).
 */

import { z } from "zod";
import { reportSpecSchema, type ReportSpec } from "@/lib/reports/spec/schema";
import type { WorkflowGraph } from "@/lib/workflows/types";
import type { Persona } from "@/lib/personas/types";

export const MARKETPLACE_KINDS = ["workflow", "report_spec", "persona"] as const;
export type MarketplaceKind = (typeof MARKETPLACE_KINDS)[number];

/** Tag : alphanumérique + dash, 2-24 caractères, max 5 par template. */
export const tagSchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "tag : alphanumérique + tirets uniquement");

export const tagsSchema = z.array(tagSchema).max(5).default([]);

// ── WorkflowGraph (validation minimale, le validateGraph côté missions
//    fait la validation forte au moment de cloner). ───────────
const workflowNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["trigger", "tool_call", "condition", "approval", "output", "transform"]),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  position: z
    .object({ x: z.number(), y: z.number() })
    .optional(),
  onError: z.enum(["abort", "skip", "retry"]).optional(),
});

const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  condition: z.string().optional(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
  startNodeId: z.string().min(1),
  version: z.number().int().min(1).optional(),
});

// ── Persona payload ─────────────────────────────────────────
//
// On ne valide que le sous-ensemble qu'on accepte de partager : pas de
// userId/tenantId/createdAt (réinjectés à la clone), pas de isDefault.
export const personaPayloadSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  tone: z
    .enum(["formal", "casual", "analytical", "creative", "direct"])
    .nullable()
    .optional(),
  vocabulary: z
    .object({
      preferred: z.array(z.string().min(1).max(40)).max(20).optional(),
      avoid: z.array(z.string().min(1).max(40)).max(20).optional(),
    })
    .nullable()
    .optional(),
  styleGuide: z.string().max(2000).nullable().optional(),
  systemPromptAddon: z.string().max(1500).nullable().optional(),
  surface: z.string().max(40).nullable().optional(),
});
export type PersonaPayload = z.infer<typeof personaPayloadSchema>;

// ── Payload union ───────────────────────────────────────────

export function validatePayload(
  kind: MarketplaceKind,
  payload: unknown,
):
  | { ok: true; data: WorkflowGraph | ReportSpec | PersonaPayload }
  | { ok: false; error: string } {
  if (kind === "workflow") {
    const r = workflowGraphSchema.safeParse(payload);
    return r.success
      ? { ok: true, data: r.data as WorkflowGraph }
      : { ok: false, error: r.error.issues[0]?.message ?? "workflow_invalid" };
  }
  if (kind === "report_spec") {
    const r = reportSpecSchema.safeParse(payload);
    return r.success
      ? { ok: true, data: r.data }
      : { ok: false, error: r.error.issues[0]?.message ?? "report_spec_invalid" };
  }
  const r = personaPayloadSchema.safeParse(payload);
  return r.success
    ? { ok: true, data: r.data }
    : { ok: false, error: r.error.issues[0]?.message ?? "persona_invalid" };
}

// ── DTO renvoyés aux clients ────────────────────────────────

export interface MarketplaceTemplateSummary {
  id: string;
  kind: MarketplaceKind;
  title: string;
  description: string | null;
  authorDisplayName: string | null;
  authorTenantId: string;
  tags: string[];
  ratingAvg: number;
  ratingCount: number;
  cloneCount: number;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceTemplate extends MarketplaceTemplateSummary {
  payload: WorkflowGraph | ReportSpec | PersonaPayload;
  authorUserId: string;
}

export interface MarketplaceRating {
  templateId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface PublishTemplateInput {
  kind: MarketplaceKind;
  title: string;
  description?: string;
  payload: unknown;
  tags?: string[];
  authorUserId: string;
  authorTenantId: string;
  authorDisplayName?: string;
}

export interface ListTemplatesInput {
  kind?: MarketplaceKind;
  tags?: string[];
  featured?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CloneResult {
  ok: boolean;
  /** Id de la ressource créée dans le tenant cible (mission.id, persona.id, template.id). */
  resourceId?: string;
  error?: string;
}

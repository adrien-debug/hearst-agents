/**
 * Schema Zod pour les templates de rapport personnalisés.
 *
 * Un template est un ReportSpec sérialisé avec des métadonnées
 * permettant de le retrouver, le nommer et le partager entre users du tenant.
 */

import { z } from "zod";
import { reportSpecSchema } from "@/lib/reports/spec/schema";

export const templateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  createdBy: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  domain: z.string().min(1),
  spec: reportSpecSchema,
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Template = z.infer<typeof templateSchema>;

// ── Inputs de mutation ──────────────────────────────────────

export const saveTemplateInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  spec: reportSpecSchema,
  isPublic: z.boolean().default(false),
});
export type SaveTemplateInput = z.infer<typeof saveTemplateInputSchema>;

export const loadTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  tenantId: z.string().min(1),
});
export type LoadTemplateInput = z.infer<typeof loadTemplateInputSchema>;

export const listTemplatesInputSchema = z.object({
  tenantId: z.string().min(1),
  domain: z.string().min(1).optional(),
});
export type ListTemplatesInput = z.infer<typeof listTemplatesInputSchema>;

export const deleteTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
});
export type DeleteTemplateInput = z.infer<typeof deleteTemplateInputSchema>;

export const updateTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  tenantId: z.string().min(1),
  userId: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    spec: reportSpecSchema.optional(),
    isPublic: z.boolean().optional(),
  }),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;

// ── DTO renvoyé aux clients (sans spec lourd pour les listes) ──

export const templateSummarySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  createdBy: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/**
 * Figma Connector — Zod Schemas
 *
 * Path: lib/connectors/packs/design-pack/schemas/figma.ts
 */

import { z } from "zod";

// Figma File
export const FigmaFileSchema = z.object({
  key: z.string(),
  name: z.string(),
  thumbnail_url: z.string().optional(),
  last_modified: z.string(),
  created_at: z.string().optional(),
  owner: z.object({ id: z.string(), handle: z.string() }).optional(),
  branches: z.array(z.object({ key: z.string(), name: z.string() })).optional(),
  version: z.string().optional(),
});

export type FigmaFile = z.infer<typeof FigmaFileSchema>;

// Figma Project
export const FigmaProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type FigmaProject = z.infer<typeof FigmaProjectSchema>;

// Figma Team
export const FigmaTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string().optional(),
});

export type FigmaTeam = z.infer<typeof FigmaTeamSchema>;

// Figma Component
export const FigmaComponentSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  component_set_id: z.string().optional(),
  documentation_links: z.array(z.object({ uri: z.string() })).optional(),
});

export type FigmaComponent = z.infer<typeof FigmaComponentSchema>;

// Figma Component Set (Variants)
export const FigmaComponentSetSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export type FigmaComponentSet = z.infer<typeof FigmaComponentSetSchema>;

// Figma Style
export const FigmaStyleSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  style_type: z.enum(["FILL", "TEXT", "EFFECT", "GRID"]),
});

export type FigmaStyle = z.infer<typeof FigmaStyleSchema>;

// Figma Variable (Design Tokens)
export const FigmaVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  key: z.string(),
  variable_collection_id: z.string(),
  resolved_type: z.enum(["BOOLEAN", "FLOAT", "STRING", "COLOR"]),
  values_by_mode: z.record(z.string(), z.unknown()),
  remote: z.boolean().default(false),
});

export type FigmaVariable = z.infer<typeof FigmaVariableSchema>;

// Figma Variable Collection
export const FigmaVariableCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  modes: z.array(z.object({ mode_id: z.string(), name: z.string() })),
  default_mode_id: z.string(),
  remote: z.boolean().default(false),
});

export type FigmaVariableCollection = z.infer<typeof FigmaVariableCollectionSchema>;

// Figma Comment
export const FigmaCommentSchema = z.object({
  id: z.string(),
  file_key: z.string(),
  parent_id: z.string().optional(),
  user: z.object({ id: z.string(), handle: z.string(), img_url: z.string().optional() }),
  created_at: z.string(),
  resolved: z.boolean().default(false),
  message: z.string(),
  client_meta: z.object({ x: z.number(), y: z.number(), node_id: z.string().optional() }).optional(),
  reactions: z.array(z.unknown()).optional(),
});

export type FigmaComment = z.infer<typeof FigmaCommentSchema>;

// Unified Design Types
export const UnifiedDesignFileSchema = z.object({
  id: z.string(),
  provider: z.literal("figma"),
  name: z.string(),
  thumbnailUrl: z.string().optional(),
  lastModified: z.date(),
  owner: z.object({ id: z.string(), name: z.string() }).optional(),
  type: z.enum(["file", "project", "component"]),
  url: z.string(),
  raw: z.unknown(),
});

export type UnifiedDesignFile = z.infer<typeof UnifiedDesignFileSchema>;

export const UnifiedDesignTokenSchema = z.object({
  id: z.string(),
  provider: z.literal("figma"),
  name: z.string(),
  type: z.enum(["color", "typography", "spacing", "shadow", "other"]),
  value: z.unknown(),
  collection: z.string(),
  mode: z.string().optional(),
  raw: z.unknown(),
});

export type UnifiedDesignToken = z.infer<typeof UnifiedDesignTokenSchema>;

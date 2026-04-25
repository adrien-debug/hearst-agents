/**
 * Notion Connector — Zod Schemas
 *
 * Path: lib/connectors/packs/productivity-pack/schemas/notion.ts
 */

import { z } from "zod";

// Notion Page
export const NotionPageSchema = z.object({
  id: z.string(),
  object: z.literal("page"),
  created_time: z.string(),
  last_edited_time: z.string(),
  created_by: z.object({ id: z.string() }).optional(),
  last_edited_by: z.object({ id: z.string() }).optional(),
  cover: z.unknown().optional(),
  icon: z.unknown().optional(),
  parent: z.union([
    z.object({ type: z.literal("database_id"), database_id: z.string() }),
    z.object({ type: z.literal("page_id"), page_id: z.string() }),
    z.object({ type: z.literal("workspace"), workspace: z.boolean() }),
  ]),
  archived: z.boolean().default(false),
  properties: z.record(z.string(), z.unknown()).default({}),
  url: z.string(),
});

export type NotionPage = z.infer<typeof NotionPageSchema>;

// Notion Database
export const NotionDatabaseSchema = z.object({
  id: z.string(),
  object: z.literal("database"),
  created_time: z.string(),
  last_edited_time: z.string(),
  created_by: z.object({ id: z.string() }).optional(),
  last_edited_by: z.object({ id: z.string() }).optional(),
  title: z.array(z.object({ plain_text: z.string() })).default([]),
  description: z.array(z.object({ plain_text: z.string() })).optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
  parent: z.object({ type: z.literal("page_id"), page_id: z.string() }),
  url: z.string(),
});

export type NotionDatabase = z.infer<typeof NotionDatabaseSchema>;

// Notion Block (content)
export const NotionBlockSchema = z.object({
  id: z.string(),
  object: z.literal("block"),
  type: z.enum([
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "to_do",
    "toggle",
    "child_page",
    "child_database",
    "image",
    "file",
    "divider",
    "quote",
    "code",
    "callout",
  ]),
  created_time: z.string().optional(),
  last_edited_time: z.string().optional(),
  has_children: z.boolean().default(false),
  archived: z.boolean().default(false),
  parent: z.object({ type: z.string(), page_id: z.string().optional() }).optional(),
  // Content varies by type - simplified
  paragraph: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  heading_1: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  heading_2: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  heading_3: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  bulleted_list_item: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  numbered_list_item: z.object({ rich_text: z.array(z.unknown()) }).optional(),
  to_do: z.object({ rich_text: z.array(z.unknown()), checked: z.boolean() }).optional(),
});

export type NotionBlock = z.infer<typeof NotionBlockSchema>;

// Notion User
export const NotionUserSchema = z.object({
  id: z.string(),
  object: z.literal("user"),
  type: z.enum(["person", "bot"]).optional(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
  person: z.object({ email: z.string().email() }).optional(),
});

export type NotionUser = z.infer<typeof NotionUserSchema>;

// Unified Productivity Types
export const UnifiedDocumentSchema = z.object({
  id: z.string(),
  provider: z.literal("notion"),
  title: z.string(),
  content: z.string().optional(),
  type: z.enum(["page", "database"]),
  parentId: z.string().optional(),
  url: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: z.object({ id: z.string(), email: z.string().optional() }).optional(),
  archived: z.boolean(),
  raw: z.unknown(),
});

export type UnifiedDocument = z.infer<typeof UnifiedDocumentSchema>;

export const UnifiedTaskSchema = z.object({
  id: z.string(),
  provider: z.literal("notion"),
  title: z.string(),
  completed: z.boolean(),
  url: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  raw: z.unknown(),
});

export type UnifiedTask = z.infer<typeof UnifiedTaskSchema>;

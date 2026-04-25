/**
 * Connector Packs — Manifest Schema (Zod)
 *
 * Validation des manifest.json avec types stricts.
 */

import { z } from "zod";
import type { ConnectorManifest, PackManifest } from "./types";

// Enums
const ConnectorCategorySchema = z.enum([
  "finance",
  "design",
  "developer",
  "crm",
  "productivity",
  "communication",
  "marketing",
  "analytics",
  "infrastructure",
]);

const AuthTypeSchema = z.enum(["oauth2", "api_key", "basic", "none"]);
const HealthSchema = z.enum(["healthy", "degraded", "down", "unknown"]);

// Connector Manifest Schema
export const ConnectorManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  category: ConnectorCategorySchema,

  auth: z.object({
    type: AuthTypeSchema,
    scopes: z.array(z.string()).optional(),
    additionalConfig: z.array(z.string()).optional(),
  }),

  capabilities: z.object({
    read: z.boolean(),
    write: z.boolean(),
    delete: z.boolean(),
    webhooks: z.boolean(),
    realtime: z.boolean(),
  }),

  icon: z.string().optional(),
  docsUrl: z.string().url().optional(),
  supportUrl: z.string().url().optional(),

  dependencies: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),

  rateLimits: z
    .object({
      requestsPerSecond: z.number().int().positive().optional(),
      requestsPerMinute: z.number().int().positive().optional(),
      requestsPerHour: z.number().int().positive().optional(),
    })
    .optional(),

  healthCheck: z
    .object({
      endpoint: z.string(),
      method: z.enum(["GET", "POST"]),
      expectedStatus: z.number().int().min(200).max(599),
    })
    .optional(),
});

// Pack Manifest Schema
export const PackManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+-pack$/, "Pack ID must end with -pack"),
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  category: ConnectorCategorySchema,

  connectors: z
    .array(ConnectorManifestSchema)
    .min(1, "Pack must have at least one connector"),

  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),

  minHearstVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  nodeVersion: z.string().optional(),
});

// Types inférés
export type ValidatedConnectorManifest = z.infer<typeof ConnectorManifestSchema>;
export type ValidatedPackManifest = z.infer<typeof PackManifestSchema>;

/**
 * Valide un manifest de connector
 */
export function validateConnectorManifest(
  data: unknown
): { success: true; data: ValidatedConnectorManifest } | { success: false; errors: string[] } {
  const result = ConnectorManifestSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return {
      success: false,
      errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }
}

/**
 * Valide un manifest de pack
 */
export function validatePackManifest(
  data: unknown
): { success: true; data: ValidatedPackManifest } | { success: false; errors: string[] } {
  const result = PackManifestSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return {
      success: false,
      errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }
}

/**
 * Version comparison for minHearstVersion check
 */
export function checkVersionCompatibility(
  currentVersion: string,
  minRequiredVersion: string
): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const current = parse(currentVersion);
  const required = parse(minRequiredVersion);

  for (let i = 0; i < 3; i++) {
    if (current[i] > required[i]) return true;
    if (current[i] < required[i]) return false;
  }

  return true; // Equal
}

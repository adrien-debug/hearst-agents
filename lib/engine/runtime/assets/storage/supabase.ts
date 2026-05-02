/**
 * Supabase Storage Provider
 *
 * Stockage assets/exports via Supabase Storage (bucket "assets" privé,
 * RLS multi-tenant via prefix tenantId/). Compatible serverless Vercel
 * (REST API), pas de pool de connexions à gérer.
 *
 * Bucket cible : `assets`. Migration SQL : supabase/migrations/0058_storage_bucket.sql
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Readable } from "node:stream";
import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  DownloadResult,
  SignedUrlOptions,
} from "./types";

export interface SupabaseStorageOptions {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  /** Public base URL pour les fichiers servis publiquement (rare). Default: dérivé. */
  publicUrlBase?: string;
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly type = "supabase" as const;
  private client: SupabaseClient;
  private bucket: string;
  private publicUrlBase: string;

  constructor(options: SupabaseStorageOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.bucket = options.bucket;
    this.publicUrlBase =
      options.publicUrlBase ??
      `${options.url.replace(/\/$/, "")}/storage/v1/object/public/${options.bucket}`;
  }

  async upload(
    key: string,
    data: Buffer | ReadableStream<Uint8Array>,
    options: {
      contentType: string;
      metadata?: Record<string, string>;
      tenantId?: string;
    },
  ): Promise<UploadResult> {
    const fullKey = options.tenantId ? `${options.tenantId}/${key}` : key;

    // Supabase JS SDK n'accepte pas ReadableStream directement — convertir en Buffer.
    const body: Buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(await readAllStream(data as ReadableStream<Uint8Array>));

    const { error } = await this.client.storage.from(this.bucket).upload(fullKey, body, {
      contentType: options.contentType,
      upsert: true,
      metadata: options.metadata,
    });

    if (error) {
      throw new Error(`[Storage/Supabase] upload failed (${fullKey}): ${error.message}`);
    }

    return {
      key,
      url: `${this.publicUrlBase}/${fullKey}`,
      size: body.length,
      provider: this.type,
    };
  }

  async download(key: string, tenantId?: string): Promise<DownloadResult> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    const { data, error } = await this.client.storage.from(this.bucket).download(fullKey);

    if (error || !data) {
      throw new Error(`[Storage/Supabase] download failed (${fullKey}): ${error?.message ?? "no data"}`);
    }

    const contentType = data.type || "application/octet-stream";
    const size = data.size;

    return {
      stream: data.stream(),
      contentType,
      size,
    };
  }

  async getSignedUrl(
    key: string,
    operation: "read" | "write",
    options?: SignedUrlOptions,
    tenantId?: string,
  ): Promise<string> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    const expiresIn = options?.expiresInSeconds ?? 3600;

    if (operation === "read") {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .createSignedUrl(fullKey, expiresIn, {
          download: options?.responseContentDisposition?.startsWith("attachment")
            ? extractFilename(options.responseContentDisposition)
            : undefined,
        });
      if (error || !data) {
        throw new Error(`[Storage/Supabase] signed URL failed (${fullKey}): ${error?.message}`);
      }
      return data.signedUrl;
    }

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(fullKey);
    if (error || !data) {
      throw new Error(`[Storage/Supabase] signed upload URL failed (${fullKey}): ${error?.message}`);
    }
    return data.signedUrl;
  }

  async delete(key: string, tenantId?: string): Promise<void> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    const { error } = await this.client.storage.from(this.bucket).remove([fullKey]);
    if (error) {
      throw new Error(`[Storage/Supabase] delete failed (${fullKey}): ${error.message}`);
    }
  }

  async exists(key: string, tenantId?: string): Promise<boolean> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    // Supabase Storage n'a pas de HEAD direct ; on liste avec le path exact.
    const folder = fullKey.includes("/") ? fullKey.slice(0, fullKey.lastIndexOf("/")) : "";
    const filename = fullKey.includes("/") ? fullKey.slice(fullKey.lastIndexOf("/") + 1) : fullKey;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(folder, { search: filename, limit: 1 });
    if (error) return false;
    return Array.isArray(data) && data.some((f) => f.name === filename);
  }

  async list(prefix: string, tenantId?: string): Promise<StorageObject[]> {
    const fullPrefix = tenantId ? `${tenantId}/${prefix}` : prefix;
    const { data, error } = await this.client.storage.from(this.bucket).list(fullPrefix, {
      limit: 1000,
    });
    if (error || !data) return [];

    return data
      .filter((f) => !!f.name)
      .map((f) => ({
        key: tenantId ? `${prefix}${prefix.endsWith("/") ? "" : "/"}${f.name}` : `${prefix}${prefix.endsWith("/") ? "" : "/"}${f.name}`,
        size: (f.metadata as { size?: number } | null)?.size ?? 0,
        contentType:
          (f.metadata as { mimetype?: string } | null)?.mimetype ?? "application/octet-stream",
        lastModified: f.updated_at ? new Date(f.updated_at) : new Date(),
        metadata: (f.metadata as Record<string, string> | null) ?? {},
      }));
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const { error } = await this.client.storage.from(this.bucket).list("", { limit: 1 });
      if (error) {
        return { ok: false, latencyMs: Date.now() - start, error: error.message };
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

async function readAllStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function extractFilename(disposition: string): string | undefined {
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1];
}

// Type-only helper to keep node:stream compat path tree-shake-friendly.
// (`Readable` import is required for type usage in some downstream files.)
export type { Readable };

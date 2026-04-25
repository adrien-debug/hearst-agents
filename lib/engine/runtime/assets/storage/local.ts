/**
 * Local Storage Provider
 *
 * Stockage filesystem pour développement.
 * Chemin: .runtime-assets/{tenantId?}/{key}
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  DownloadResult,
  SignedUrlOptions,
} from "./types";
import { normalizeStorageKey } from "./types";

export interface LocalStorageOptions {
  basePath: string; // e.g., ".runtime-assets"
  publicBaseUrl: string; // e.g., "http://localhost:9000/assets"
}

export class LocalStorageProvider implements StorageProvider {
  readonly type = "local" as const;
  private basePath: string;
  private publicBaseUrl: string;

  constructor(options: LocalStorageOptions) {
    this.basePath = path.resolve(options.basePath);
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");
  }

  async upload(
    key: string,
    data: Buffer | ReadableStream<Uint8Array>,
    options: {
      contentType: string;
      metadata?: Record<string, string>;
      tenantId?: string;
    }
  ): Promise<UploadResult> {
    key = normalizeStorageKey(key);

    const dirPath = options.tenantId
      ? path.join(this.basePath, options.tenantId, path.dirname(key))
      : path.join(this.basePath, path.dirname(key));

    await fs.mkdir(dirPath, { recursive: true });

    const fullPath = options.tenantId
      ? path.join(this.basePath, options.tenantId, key)
      : path.join(this.basePath, key);

    // Convert stream to buffer if needed
    let buffer: Buffer;
    if (data instanceof ReadableStream) {
      const reader = data.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } else {
      buffer = data;
    }

    await fs.writeFile(fullPath, buffer);

    if (options.metadata) {
      await fs.writeFile(
        `${fullPath}.meta.json`,
        JSON.stringify({
          contentType: options.contentType,
          ...options.metadata,
          uploadedAt: new Date().toISOString(),
        })
      );
    }

    return {
      key,
      url: this.getPublicUrl(key, options.tenantId),
      size: buffer.length,
      provider: this.type,
    };
  }

  async download(key: string, tenantId?: string): Promise<DownloadResult> {
    key = normalizeStorageKey(key);

    const fullPath = tenantId
      ? path.join(this.basePath, tenantId, key)
      : path.join(this.basePath, key);

    const stats = await fs.stat(fullPath);
    const fileHandle = await fs.open(fullPath, "r");

    const nodeStream = fileHandle.createReadStream();
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer | string) => {
          if (typeof chunk === "string") {
            controller.enqueue(new TextEncoder().encode(chunk));
          } else {
            controller.enqueue(new Uint8Array(chunk));
          }
        });
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    let contentType = "application/octet-stream";
    try {
      const metaRaw = await fs.readFile(`${fullPath}.meta.json`, "utf-8");
      const meta = JSON.parse(metaRaw);
      contentType = meta.contentType || contentType;
    } catch {
      // No metadata
    }

    return {
      stream: webStream,
      contentType,
      size: stats.size,
    };
  }

  async getSignedUrl(
    key: string,
    operation: "read" | "write",
    options?: SignedUrlOptions,
    tenantId?: string
  ): Promise<string> {
    key = normalizeStorageKey(key);

    if (operation === "read") {
      const expires = Date.now() + (options?.expiresInSeconds || 3600) * 1000;
      const token = crypto
        .createHmac("sha256", "local-secret-dev-only")
        .update(`${key}:${expires}`)
        .digest("hex");
      return `${this.getPublicUrl(key, tenantId)}?token=${token}&expires=${expires}`;
    }
    return this.getPublicUrl(key, tenantId);
  }

  async delete(key: string, tenantId?: string): Promise<void> {
    key = normalizeStorageKey(key);

    const fullPath = tenantId
      ? path.join(this.basePath, tenantId, key)
      : path.join(this.basePath, key);

    await fs.unlink(fullPath).catch(() => {});
    await fs.unlink(`${fullPath}.meta.json`).catch(() => {});
  }

  async exists(key: string, tenantId?: string): Promise<boolean> {
    key = normalizeStorageKey(key);

    const fullPath = tenantId
      ? path.join(this.basePath, tenantId, key)
      : path.join(this.basePath, key);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string, tenantId?: string): Promise<StorageObject[]> {
    prefix = normalizeStorageKey(prefix);

    const searchPath = tenantId
      ? path.join(this.basePath, tenantId, prefix)
      : path.join(this.basePath, prefix);

    const results: StorageObject[] = [];

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith(".meta.json")) continue;

        const fullPath = path.join(searchPath, entry.name);
        const stats = await fs.stat(fullPath);
        // Key is relative to prefix, not including the prefix itself
        const relativeKey = entry.name;

        let contentType = "application/octet-stream";
        try {
          const metaRaw = await fs.readFile(`${fullPath}.meta.json`, "utf-8");
          const meta = JSON.parse(metaRaw);
          contentType = meta.contentType || contentType;
        } catch {
          // No metadata
        }

        results.push({
          key: relativeKey,
          size: stats.size,
          contentType,
          lastModified: stats.mtime,
          metadata: {},
        });
      }
    } catch {
      // Directory doesn't exist
    }

    return results;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await fs.access(this.basePath);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Cannot access basePath: ${err}`,
      };
    }
  }

  private getPublicUrl(key: string, tenantId?: string): string {
    const tenantPrefix = tenantId ? `/${tenantId}` : "";
    return `${this.publicBaseUrl}${tenantPrefix}/${key}`;
  }
}

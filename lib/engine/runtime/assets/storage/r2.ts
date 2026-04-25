/**
 * Cloudflare R2 Storage Provider
 *
 * Production-grade storage with S3-compatible API.
 * Benefits: No egress fees, global CDN, edge caching.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  DownloadResult,
  SignedUrlOptions,
} from "./types";

export interface R2StorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string; // e.g., "https://cdn.hearst.io" or R2.dev subdomain
  region?: string; // Default: "auto"
}

export class R2StorageProvider implements StorageProvider {
  readonly type = "r2" as const;
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(options: R2StorageOptions) {
    const config: S3ClientConfig = {
      region: options.region || "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };

    this.client = new S3Client(config);
    this.bucket = options.bucket;
    this.publicUrl = options.publicUrl.replace(/\/$/, "");
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
    const fullKey = options.tenantId ? `${options.tenantId}/${key}` : key;

    // Use multipart upload for streams (efficient for large files)
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: fullKey,
        Body: data,
        ContentType: options.contentType,
        Metadata: options.metadata,
      },
    });

    await upload.done();

    // Get the actual size from a head request
    const headResult = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      })
    );

    return {
      key,
      url: this.getPublicUrl(key, options.tenantId),
      size: headResult.ContentLength || 0,
      provider: this.type,
    };
  }

  async download(key: string, tenantId?: string): Promise<DownloadResult> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fullKey,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`R2: Object not found: ${fullKey}`);
    }

    // Convert AWS SDK stream to Web ReadableStream
    const nodeStream = response.Body as import("stream").Readable;
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return {
      stream: webStream,
      contentType: response.ContentType || "application/octet-stream",
      size: response.ContentLength || 0,
    };
  }

  async getSignedUrl(
    key: string,
    operation: "read" | "write",
    options?: SignedUrlOptions,
    tenantId?: string
  ): Promise<string> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    const expiresIn = options?.expiresInSeconds || 3600;

    if (operation === "read") {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        ResponseContentDisposition: options?.responseContentDisposition,
      });
      return getSignedUrl(this.client, command, { expiresIn });
    } else {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });
      return getSignedUrl(this.client, command, { expiresIn });
    }
  }

  async delete(key: string, tenantId?: string): Promise<void> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fullKey,
    });

    await this.client.send(command);
  }

  async exists(key: string, tenantId?: string): Promise<boolean> {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });
      await this.client.send(command);
      return true;
    } catch (err) {
      return false;
    }
  }

  async list(prefix: string, tenantId?: string): Promise<StorageObject[]> {
    const fullPrefix = tenantId ? `${tenantId}/${prefix}` : prefix;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: fullPrefix,
    });

    const response = await this.client.send(command);
    const objects: StorageObject[] = [];

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Size) continue;

      // Remove tenant prefix from key
      const key = tenantId
        ? obj.Key.replace(`${tenantId}/`, "")
        : obj.Key;

      objects.push({
        key,
        size: obj.Size,
        contentType: "application/octet-stream", // R2 doesn't return content-type in list
        lastModified: obj.LastModified || new Date(),
        metadata: {},
      });
    }

    return objects;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      // Try to list with max 1 item
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });
      await this.client.send(command);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `R2 health check failed: ${err}`,
      };
    }
  }

  private getPublicUrl(key: string, tenantId?: string): string {
    const fullKey = tenantId ? `${tenantId}/${key}` : key;
    return `${this.publicUrl}/${fullKey}`;
  }
}

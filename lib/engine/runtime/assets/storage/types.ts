/**
 * Storage Provider — Types
 *
 * Abstraction pour stockage multi-tier (local, cloud R2/S3, hybrid).
 * Permet migration transparente dev → production.
 */

export type StorageProviderType = "local" | "r2" | "s3" | "hybrid";

export interface StorageObject {
  key: string; // path relative (e.g., "runs/{runId}/{filename}")
  size: number;
  contentType: string;
  lastModified: Date;
  metadata: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresInSeconds: number; // Default: 3600 (1h)
  responseContentDisposition?: string; // e.g., "attachment; filename=\"report.pdf\""
}

export interface UploadResult {
  key: string;
  url: string; // Public URL or signed URL for read
  size: number;
  provider: StorageProviderType;
}

export interface DownloadResult {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

/**
 * Core interface — implémentée par chaque provider
 */
export interface StorageProvider {
  readonly type: StorageProviderType;

  /**
   * Upload un fichier. Retourne la clé et URL d'accès.
   */
  upload(
    key: string,
    data: Buffer | ReadableStream<Uint8Array>,
    options: {
      contentType: string;
      metadata?: Record<string, string>;
      tenantId?: string;
    }
  ): Promise<UploadResult>;

  /**
   * Download par streaming (efficient pour gros fichiers)
   */
  download(key: string): Promise<DownloadResult>;

  /**
   * Génère URL signée pour accès direct (download/upload)
   */
  getSignedUrl(
    key: string,
    operation: "read" | "write",
    options?: SignedUrlOptions
  ): Promise<string>;

  /**
   * Suppression
   */
  delete(key: string): Promise<void>;

  /**
   * Vérification existence
   */
  exists(key: string): Promise<boolean>;

  /**
   * Liste les objets avec préfixe
   */
  list(prefix: string): Promise<StorageObject[]>;

  /**
   * Health check — pour monitoring
   */
  health(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

/**
 * Configuration factory
 */
export interface StorageConfig {
  provider: StorageProviderType;
  local?: {
    basePath: string; // e.g., ".runtime-assets/"
    publicBaseUrl?: string; // e.g., "http://localhost:9000/assets"
  };
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string; // e.g., "https://cdn.hearst.io"
    region?: string; // Default: "auto"
  };
  s3?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
  hybrid?: {
    hotProvider: StorageProviderType; // e.g., "local"
    coldProvider: StorageProviderType; // e.g., "r2"
    maxHotSizeBytes: number; // e.g., 100MB
    maxHotFiles?: number; // e.g., 1000
    ttlSeconds: number; // Cache TTL
  };
}

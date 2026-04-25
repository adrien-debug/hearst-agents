/**
 * Connector Packs — Types
 *
 * Architecture modulaire pour 200+ connecteurs organisés par domaine.
 * Chaque pack est auto-découvrable avec manifest.json
 */

export type ConnectorCategory =
  | "finance"
  | "design"
  | "developer"
  | "crm"
  | "productivity"
  | "communication"
  | "marketing"
  | "analytics"
  | "infrastructure";

export type ConnectorAuthType = "oauth2" | "api_key" | "basic" | "none";

export type ConnectorHealth = "healthy" | "degraded" | "down" | "unknown";

/**
 * Manifest.json — Déclaration d'un connecteur dans un pack
 */
export interface ConnectorManifest {
  id: string; // e.g., "stripe"
  name: string; // e.g., "Stripe"
  description: string;
  version: string;
  category: ConnectorCategory;

  // Auth configuration
  auth: {
    type: ConnectorAuthType;
    scopes?: string[]; // OAuth scopes requis
    additionalConfig?: string[]; // e.g., ["webhook_secret"]
  };

  // Capabilities déclaratives
  capabilities: {
    read: boolean;
    write: boolean;
    delete: boolean;
    webhooks: boolean;
    realtime: boolean;
  };

  // Métadonnées
  icon?: string; // URL ou emoji
  docsUrl?: string;
  supportUrl?: string;

  // Dépendances
  dependencies?: string[]; // IDs d'autres connecteurs requis
  conflicts?: string[]; // IDs incompatibles

  // Rate limiting
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };

  // Health check endpoint
  healthCheck?: {
    endpoint: string;
    method: "GET" | "POST";
    expectedStatus: number;
  };
}

/**
 * Manifest.json — Déclaration d'un pack complet
 */
export interface PackManifest {
  id: string; // e.g., "finance-pack"
  name: string; // e.g., "Finance Pack"
  description: string;
  version: string;
  category: ConnectorCategory;

  // Connecteurs inclus
  connectors: ConnectorManifest[];

  // Métadonnées
  author?: string;
  license?: string;
  homepage?: string;

  // Requirements
  minHearstVersion?: string;
  nodeVersion?: string;
}

/**
 * Instance d'un connecteur activé (par tenant/user)
 */
export interface ConnectorInstance {
  id: string; // UUID
  connectorId: string; // e.g., "stripe"
  packId: string; // e.g., "finance-pack"
  tenantId: string;
  userId: string;

  // Configuration chiffrée
  config: {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    additionalParams?: Record<string, string>;
  };

  // État
  status: "active" | "inactive" | "error" | "revoked";
  health: ConnectorHealth;
  lastUsedAt?: Date;
  lastError?: string;
  errorCount: number;

  // Webhooks
  webhookUrl?: string;
  webhookSecret?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface unifiée pour tous les connecteurs
 */
export interface ConnectorInterface {
  // CRUD operations
  list<T>(resource: string, params?: unknown): Promise<T[]>;
  get<T>(resource: string, id: string): Promise<T | null>;
  create<T>(resource: string, data: unknown): Promise<T>;
  update<T>(resource: string, id: string, data: unknown): Promise<T>;
  delete(resource: string, id: string): Promise<void>;

  // Health
  health(): Promise<ConnectorHealth>;

  // Webhooks
  handleWebhook(payload: unknown, signature: string): Promise<void>;
}

/**
 * Événements du système de packs
 */
export interface PackEventMap {
  "pack:loaded": { packId: string; connectorCount: number };
  "pack:error": { packId: string; error: string };
  "connector:enabled": { connectorId: string; instanceId: string };
  "connector:disabled": { connectorId: string; instanceId: string };
  "connector:health-changed": {
    connectorId: string;
    from: ConnectorHealth;
    to: ConnectorHealth;
  };
}

/**
 * Résultat du loader
 */
export interface PackLoadResult {
  packId: string;
  success: boolean;
  connectors: string[];
  error?: string;
}

/**
 * Configuration du pack loader
 */
export interface PackLoaderConfig {
  packsDirectory: string; // e.g., "lib/connectors/packs"
  autoDiscover: boolean; // Scan au boot
  validateManifests: boolean; // Zod validation
  enableHotReload: boolean; // Dev only
  maxConcurrentHealthChecks: number;
}

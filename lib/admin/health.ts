/**
 * Admin Health API — Architecture Finale
 *
 * System health monitoring with real checks.
 * Path: lib/admin/health.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "../engine/runtime/assets/storage/types";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: boolean;
    storage: boolean;
    connectors: boolean;
    llm: boolean;
    cache?: boolean;
  };
  latency: {
    database: number;
    storage: number;
    llm?: number;
    cache?: number;
  };
  details: {
    database?: string;
    storage?: string;
    connectors?: string;
    llm?: string;
    cache?: string;
  };
  timestamp: string;
  version: string;
}

export interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  message?: string;
  lastChecked: string;
}

/**
 * Get comprehensive system health
 */
export async function getSystemHealth(
  db: SupabaseClient,
  storage?: StorageProvider,
  options?: {
    checkLLM?: boolean;
    checkCache?: boolean;
  }
): Promise<HealthStatus> {
  const checks: HealthStatus["checks"] = {
    database: false,
    storage: false,
    connectors: false,
    llm: false,
  };
  const latency: HealthStatus["latency"] = {
    database: 0,
    storage: 0,
  };
  const details: HealthStatus["details"] = {};

  // 1. Database health check
  const dbHealth = await checkDatabaseHealth(db);
  checks.database = dbHealth.ok;
  latency.database = dbHealth.latencyMs;
  if (!dbHealth.ok) {
    details.database = dbHealth.error || "Database check failed";
  }

  // 2. Storage health check
  if (storage) {
    const storageHealth = await checkStorageHealth(storage);
    checks.storage = storageHealth.ok;
    latency.storage = storageHealth.latencyMs;
    if (!storageHealth.ok) {
      details.storage = storageHealth.error || "Storage check failed";
    }
  } else {
    checks.storage = true; // No storage configured = OK
    latency.storage = 0;
  }

  // 3. Connectors health (basic query check)
  const connectorsHealth = await checkConnectorsHealth(db);
  checks.connectors = connectorsHealth.ok;
  if (!connectorsHealth.ok) {
    details.connectors = connectorsHealth.error;
  }

  // 4. LLM health (optional)
  if (options?.checkLLM) {
    const llmHealth = await checkLLMHealth();
    checks.llm = llmHealth.ok;
    latency.llm = llmHealth.latencyMs;
    if (!llmHealth.ok) {
      details.llm = llmHealth.error;
    }
  } else {
    checks.llm = true; // Not checked = OK
  }

  // Determine overall status
  const failedChecks = Object.values(checks).filter((v) => !v).length;
  const status: HealthStatus["status"] =
    failedChecks === 0 ? "healthy" : failedChecks === 1 ? "degraded" : "unhealthy";

  return {
    status,
    checks,
    latency,
    details,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "unknown",
  };
}

/**
 * Check database connectivity and performance
 */
export async function checkDatabaseHealth(
  db: SupabaseClient
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();

  try {
    // Simple health check query
    const { error } = await db
      .from("system_settings")
      .select("count", { count: "exact", head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      return {
        ok: false,
        latencyMs,
        error: `Database query failed: ${error.message}`,
      };
    }

    return { ok: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

/**
 * Check storage provider health
 */
export async function checkStorageHealth(
  storage: StorageProvider
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();

  try {
    const result = await storage.health();
    return {
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Storage health check failed",
    };
  }
}

/**
 * Check connectors subsystem health
 */
async function checkConnectorsHealth(
  db: SupabaseClient
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Check if we can query integration_connections
    const { error } = await db
      .from("integration_connections")
      .select("count", { count: "exact", head: true });

    if (error) {
      return { ok: false, error: `Connectors query failed: ${error.message}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connectors check failed",
    };
  }
}

/**
 * Check LLM providers health
 */
async function checkLLMHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    // Check Anthropic API (primary provider)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        latencyMs: 0,
        error: "ANTHROPIC_API_KEY not configured",
      };
    }

    // Simple auth check (not actual API call to avoid costs)
    const hasValidKey = apiKey.startsWith("sk-") && apiKey.length > 20;

    if (!hasValidKey) {
      return {
        ok: false,
        latencyMs: 0,
        error: "Invalid ANTHROPIC_API_KEY format",
      };
    }

    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "LLM check failed",
    };
  }
}

/**
 * Get detailed component health
 */
export async function getComponentHealth(
  db: SupabaseClient,
  component: string
): Promise<ComponentHealth> {
  const start = Date.now();

  switch (component) {
    case "database": {
      const dbHealth = await checkDatabaseHealth(db);
      return {
        name: "database",
        status: dbHealth.ok ? "healthy" : "unhealthy",
        latencyMs: dbHealth.latencyMs,
        message: dbHealth.error,
        lastChecked: new Date().toISOString(),
      };
    }

    case "llm": {
      const llmHealth = await checkLLMHealth();
      return {
        name: "llm",
        status: llmHealth.ok ? "healthy" : "unhealthy",
        latencyMs: llmHealth.latencyMs,
        message: llmHealth.error,
        lastChecked: new Date().toISOString(),
      };
    }

    default:
      return {
        name: component,
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: `Unknown component: ${component}`,
        lastChecked: new Date().toISOString(),
      };
  }
}

/**
 * Health check for load balancers / k8s probes
 */
export async function livenessProbe(db: SupabaseClient): Promise<boolean> {
  const health = await checkDatabaseHealth(db);
  return health.ok;
}

/**
 * Readiness check (more comprehensive)
 */
export async function readinessProbe(
  db: SupabaseClient,
  storage?: StorageProvider
): Promise<{ ready: boolean; reason?: string }> {
  const dbHealth = await checkDatabaseHealth(db);
  if (!dbHealth.ok) {
    return { ready: false, reason: "Database unavailable" };
  }

  if (storage) {
    const storageHealth = await checkStorageHealth(storage);
    if (!storageHealth.ok) {
      return { ready: false, reason: "Storage unavailable" };
    }
  }

  return { ready: true };
}

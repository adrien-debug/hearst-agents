/**
 * Nango Client — Singleton instance for HEARST OS
 *
 * Provides authenticated access to Nango API for 200+ connectors.
 * Lazy initialization with environment-based configuration.
 */

import { Nango } from "@nangohq/node";
import type { NangoClient, NangoConfig } from "./types";

let nangoClient: NangoClient | null = null;

export function getNangoConfig(): NangoConfig {
  const secretKey = process.env.NANGO_SECRET_KEY;

  if (!secretKey) {
    console.warn(
      "[Nango] NANGO_SECRET_KEY not configured. " +
      "200+ integrations will be disabled. " +
      "Set NANGO_SECRET_KEY in .env.local to enable."
    );
  }

  return {
    secretKey: secretKey || "",
    host: process.env.NANGO_HOST || "https://api.nango.dev",
    maxRetries: 3,
    retryDelay: 1000,
  };
}

export function getNangoClient(): NangoClient {
  if (!nangoClient) {
    const config = getNangoConfig();
    if (!config.secretKey) {
      throw new Error(
        "NANGO_SECRET_KEY is not configured. " +
        "Set it in .env.local to enable 200+ integrations."
      );
    }
    nangoClient = new Nango({
      secretKey: config.secretKey,
      host: config.host,
    });
  }
  return nangoClient;
}

export function resetNangoClient(): void {
  nangoClient = null;
}

export function setNangoClient(client: NangoClient): void {
  nangoClient = client;
}

export function isNangoEnabled(): boolean {
  return !!process.env.NANGO_SECRET_KEY;
}

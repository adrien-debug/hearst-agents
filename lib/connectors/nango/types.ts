/**
 * Nango Integration Types
 *
 * Defines types for Nango SDK integration, connection management,
 * and proxy API calls for 200+ connectors.
 */

import type { Nango } from "@nangohq/node";

export type NangoProvider =
  | "hubspot"
  | "stripe"
  | "jira"
  | "airtable"
  | "figma"
  | "zapier"
  | "notion"
  | "github"
  | "slack"
  | "google"
  | "salesforce"
  | "mailchimp"
  | "intercom"
  | "linear"
  | "asana"
  | "trello"
  | "monday"
  | "quickbooks"
  | "xero"
  | "shopify"
  | string; // 200+ providers

export interface NangoConnection {
  id: string;
  connection_id: string;
  provider: NangoProvider;
  status: "active" | "error" | "pending";
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface NangoConnectionRecord {
  id: string;
  user_id: string;
  tenant_id: string;
  provider: NangoProvider;
  nango_connection_id: string;
  status: "active" | "error" | "revoked";
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface NangoProxyRequest {
  provider: NangoProvider;
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  data?: unknown;
  params?: Record<string, string>;
}

export interface NangoProxyResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface NangoWebhookPayload {
  type: "connection.created" | "connection.deleted" | "connection.error" | "auth.error";
  connectionId: string;
  provider: NangoProvider;
  userId?: string;
  error?: string;
  timestamp: string;
}

export type NangoClient = Nango;

export interface NangoConfig {
  secretKey: string;
  host?: string; // Default: https://api.nango.dev
  maxRetries?: number;
  retryDelay?: number;
}

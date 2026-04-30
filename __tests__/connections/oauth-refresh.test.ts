/**
 * Tests — lib/connections/oauth-refresh.ts
 *
 * Couvre :
 *  - checkExpiringTokens : retourne vide si Composio non configuré
 *  - checkExpiringTokens : détecte EXPIRED + ACTIVE proche expiry
 *  - refreshOAuthToken : stub ACTIVE → ok
 *  - refreshOAuthToken : stub EXPIRED → revoked
 *  - refreshOAuthToken : Composio non configuré → unavailable
 *  - scheduleTokenRefresh : délègue à checkExpiringTokens
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const { accountsList } = vi.hoisted(() => ({
  accountsList: vi.fn(),
}));

vi.mock("@composio/core", () => {
  class Composio {
    tools = { execute: vi.fn(), list: vi.fn() };
    toolkits = { list: vi.fn(), get: vi.fn(), authorize: vi.fn() };
    connectedAccounts = { list: accountsList, delete: vi.fn() };
    create = vi.fn();
    constructor(_opts: { apiKey?: string }) {}
  }
  return { Composio };
});

// ── Import après mocks ────────────────────────────────────────

import {
  checkExpiringTokens,
  refreshOAuthToken,
  scheduleTokenRefresh,
  AUTH_EXPIRING_DAYS_THRESHOLD,
  AUTH_CRITICAL_DAYS_THRESHOLD,
} from "@/lib/connections/oauth-refresh";
import { resetComposioClient } from "@/lib/connectors/composio";

// ── Helpers ──────────────────────────────────────────────────

const USER_ID = "00000000-0000-4000-8000-100000000001";
const TENANT_ID = "00000000-0000-4000-8000-100000000002";

/** Date ISO d'il y a N jours. */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** Fabrique un ConnectedAccount Composio brut. */
function makeRawAccount(
  id: string,
  appName: string,
  status: string,
  updatedAt: string,
) {
  return {
    id,
    toolkit: { slug: appName },
    status,
    updatedAt,
  };
}

// ── Setup ────────────────────────────────────────────────────

beforeEach(() => {
  resetComposioClient();
  accountsList.mockReset();
  process.env.COMPOSIO_API_KEY = "ak_test";
});

afterEach(() => {
  delete process.env.COMPOSIO_API_KEY;
  resetComposioClient();
});

// ── Tests checkExpiringTokens ────────────────────────────────

describe("checkExpiringTokens", () => {
  it("retourne [] si Composio non configuré", async () => {
    delete process.env.COMPOSIO_API_KEY;
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toEqual([]);
  });

  it("retourne [] si aucune connexion expirante", async () => {
    // Connexion ACTIVE mise à jour hier → 89 jours restants (>7j)
    accountsList.mockResolvedValueOnce({
      items: [makeRawAccount("c1", "slack", "ACTIVE", daysAgo(1))],
    });
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toHaveLength(0);
  });

  it("détecte une connexion EXPIRED", async () => {
    accountsList.mockResolvedValueOnce({
      items: [makeRawAccount("c1", "github", "EXPIRED", daysAgo(5))],
    });
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toHaveLength(1);
    expect(result[0]!.appName).toBe("github");
    expect(result[0]!.status).toBe("expired");
    expect(result[0]!.daysUntilExpiry).toBe(0);
  });

  it("détecte une connexion ACTIVE expirant dans < 7j", async () => {
    // updatedAt = 85 jours ago → 90-85=5 jours restants
    accountsList.mockResolvedValueOnce({
      items: [makeRawAccount("c1", "notion", "ACTIVE", daysAgo(85))],
    });
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("expiring_soon");
    expect(result[0]!.daysUntilExpiry).toBeGreaterThan(0);
    expect(result[0]!.daysUntilExpiry).toBeLessThanOrEqual(AUTH_EXPIRING_DAYS_THRESHOLD);
  });

  it("ne retourne pas une connexion ACTIVE loin de l'expiry (>7j)", async () => {
    // updatedAt = 30j → 60 jours restants
    accountsList.mockResolvedValueOnce({
      items: [makeRawAccount("c1", "jira", "ACTIVE", daysAgo(30))],
    });
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toHaveLength(0);
  });

  it("retourne plusieurs connexions expirantes", async () => {
    accountsList.mockResolvedValueOnce({
      items: [
        makeRawAccount("c1", "github", "EXPIRED", daysAgo(2)),
        makeRawAccount("c2", "notion", "ACTIVE", daysAgo(87)),
        makeRawAccount("c3", "slack", "ACTIVE", daysAgo(10)), // 80j restants → ok
      ],
    });
    const result = await checkExpiringTokens({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.appName)).toContain("github");
    expect(result.map((c) => c.appName)).toContain("notion");
  });
});

// ── Tests refreshOAuthToken ──────────────────────────────────

describe("refreshOAuthToken", () => {
  it("retourne unavailable si Composio non configuré", async () => {
    delete process.env.COMPOSIO_API_KEY;
    const result = await refreshOAuthToken({
      connectionId: "c1",
      appName: "slack",
      userId: USER_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("unavailable");
  });

  it("retourne ok=true si la connexion est ACTIVE dans Composio", async () => {
    accountsList.mockResolvedValueOnce({
      items: [{ id: "c1", status: "ACTIVE" }],
    });
    const result = await refreshOAuthToken({
      connectionId: "c1",
      appName: "slack",
      userId: USER_ID,
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("refreshed");
  });

  it("retourne ok=false + revoked si la connexion est EXPIRED", async () => {
    accountsList.mockResolvedValueOnce({
      items: [{ id: "c1", status: "EXPIRED" }],
    });
    const result = await refreshOAuthToken({
      connectionId: "c1",
      appName: "github",
      userId: USER_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("revoked");
    expect(result.reason).toMatch(/expiré|révoqué/i);
  });

  it("retourne ok=false + revoked si connexion introuvable", async () => {
    accountsList.mockResolvedValueOnce({ items: [] });
    const result = await refreshOAuthToken({
      connectionId: "c999",
      appName: "notion",
      userId: USER_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("revoked");
  });

  it("absorbe les erreurs Composio sans throw", async () => {
    accountsList.mockRejectedValueOnce(new Error("Composio network error"));
    const result = await refreshOAuthToken({
      connectionId: "c1",
      appName: "slack",
      userId: USER_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("revoked");
    expect(result.reason).toContain("Composio network error");
  });
});

// ── Tests scheduleTokenRefresh ───────────────────────────────

describe("scheduleTokenRefresh", () => {
  it("retourne queued=0 si aucune connexion expirante", async () => {
    accountsList.mockResolvedValueOnce({ items: [] });
    const result = await scheduleTokenRefresh({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.queued).toBe(0);
    expect(result.connectionIds).toEqual([]);
  });

  it("retourne queued=N avec les IDs des connexions expirantes", async () => {
    accountsList.mockResolvedValueOnce({
      items: [
        makeRawAccount("c1", "github", "EXPIRED", daysAgo(2)),
        makeRawAccount("c2", "notion", "ACTIVE", daysAgo(86)),
      ],
    });
    const result = await scheduleTokenRefresh({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.queued).toBe(2);
    expect(result.connectionIds).toContain("c1");
    expect(result.connectionIds).toContain("c2");
  });
});

// ── Tests constantes ─────────────────────────────────────────

describe("constantes seuil", () => {
  it("AUTH_EXPIRING_DAYS_THRESHOLD = 7", () => {
    expect(AUTH_EXPIRING_DAYS_THRESHOLD).toBe(7);
  });

  it("AUTH_CRITICAL_DAYS_THRESHOLD = 3 < AUTH_EXPIRING_DAYS_THRESHOLD", () => {
    expect(AUTH_CRITICAL_DAYS_THRESHOLD).toBeLessThan(AUTH_EXPIRING_DAYS_THRESHOLD);
  });
});

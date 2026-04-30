/**
 * Tests — lib/engine/runtime/jobs/check-oauth-tokens.ts
 *
 * Couvre :
 *  - Happy path : refresh OK → notification "info" + webhookDispatched=true
 *  - Refresh impossible (revoked) → notification "critical" + webhookDispatched=true
 *  - Aucun token expirant → 0 notifs, 0 webhooks
 *  - Payload invalide Zod → erreur propre, pas de throw
 *  - dryRun=true → pas de webhook dispatch
 *  - buildCheckOAuthTokensPayload : valide / invalide
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mocks — hoisted pour éviter l'erreur "before initialization" ────────────

const {
  mockCheckExpiringTokens,
  mockRefreshOAuthToken,
  mockCreateNotification,
  mockDispatchWebhookEvent,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockCheckExpiringTokens: vi.fn(),
  mockRefreshOAuthToken: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockDispatchWebhookEvent: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/connections/oauth-refresh", () => ({
  checkExpiringTokens: mockCheckExpiringTokens,
  refreshOAuthToken: mockRefreshOAuthToken,
  AUTH_EXPIRING_DAYS_THRESHOLD: 7,
}));

vi.mock("@/lib/notifications/in-app", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("@/lib/webhooks/dispatcher", () => ({
  dispatchWebhookEvent: mockDispatchWebhookEvent,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

// ── Import après mocks ────────────────────────────────────────

import {
  runCheckOAuthTokensJob,
  buildCheckOAuthTokensPayload,
} from "@/lib/engine/runtime/jobs/check-oauth-tokens";
import type { ExpiringConnection } from "@/lib/connections/oauth-refresh";

// ── Helpers ──────────────────────────────────────────────────

const USER_ID = "00000000-0000-4000-8000-100000000001";
const TENANT_ID = "00000000-0000-4000-8000-100000000002";

function makeExpiring(
  id: string,
  appName: string,
  daysUntilExpiry: number | null,
  status: "expiring_soon" | "expired" = "expiring_soon",
): ExpiringConnection {
  return {
    connectionId: id,
    appName,
    userId: USER_ID,
    tenantId: TENANT_ID,
    daysUntilExpiry,
    status,
  };
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

// ── Mock Supabase client ──────────────────────────────────────

const mockDb = { from: vi.fn() };

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  mockCheckExpiringTokens.mockReset();
  mockRefreshOAuthToken.mockReset();
  mockCreateNotification.mockReset();
  mockDispatchWebhookEvent.mockReset();
  mockCreateClient.mockReturnValue(mockDb);

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  // Default : createNotification retourne une notif fictive
  mockCreateNotification.mockResolvedValue({
    id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    user_id: USER_ID,
    kind: "signal",
    severity: "info",
    title: "test",
    body: null,
    meta: null,
    read_at: null,
    created_at: new Date().toISOString(),
  });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ── Tests payload validation ─────────────────────────────────

describe("validation payload", () => {
  it("retourne erreur propre si userId n'est pas un UUID", async () => {
    const result = await runCheckOAuthTokensJob(
      makePayload({ userId: "pas-un-uuid" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UUID|invalide/i);
    expect(result.checked).toBe(0);
  });

  it("retourne erreur propre si tenantId n'est pas un UUID", async () => {
    const result = await runCheckOAuthTokensJob(
      makePayload({ tenantId: "invalid-tenant" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("retourne erreur propre si payload null", async () => {
    const result = await runCheckOAuthTokensJob(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── Tests happy path ──────────────────────────────────────────

describe("happy path — refresh OK", () => {
  it("rafraîchit un token ACTIVE et crée une notif info", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([
      makeExpiring("c1", "slack", 5, "expiring_soon"),
    ]);
    mockRefreshOAuthToken.mockResolvedValueOnce({
      connectionId: "c1",
      appName: "slack",
      ok: true,
      outcome: "refreshed",
    });

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.refreshed).toBe(1);
    expect(result.revoked).toBe(0);
    expect(result.notificationsSent).toBe(1);

    // Vérifie la notif info
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        severity: "info",
        title: expect.stringContaining("slack"),
        kind: "signal",
      }),
    );
  });

  it("dispatche le webhook auth.token_expiring", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([
      makeExpiring("c1", "slack", 5, "expiring_soon"),
    ]);
    mockRefreshOAuthToken.mockResolvedValueOnce({
      connectionId: "c1",
      appName: "slack",
      ok: true,
      outcome: "refreshed",
    });

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.webhookDispatched).toBe(true);
    expect(mockDispatchWebhookEvent).toHaveBeenCalledWith(
      "auth.token_expiring",
      TENANT_ID,
      expect.objectContaining({
        userId: USER_ID,
        totalExpiring: 1,
        refreshed: 1,
        revoked: 0,
      }),
    );
  });
});

// ── Tests refresh impossible (revoked) ───────────────────────

describe("refresh impossible — notification critical", () => {
  it("crée une notification critical si token révoqué", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([
      makeExpiring("c1", "github", 0, "expired"),
    ]);
    // Status expired → refresh non tenté (bypass dans le job)

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.ok).toBe(true);
    expect(result.revoked).toBe(1);
    expect(result.refreshed).toBe(0);
    expect(result.notificationsSent).toBe(1);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        severity: "critical",
        title: expect.stringContaining("github"),
      }),
    );
  });

  it("crée une notification critical si refresh retourne ok=false", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([
      makeExpiring("c2", "notion", 3, "expiring_soon"),
    ]);
    mockRefreshOAuthToken.mockResolvedValueOnce({
      connectionId: "c2",
      appName: "notion",
      ok: false,
      outcome: "revoked",
      reason: "Token révoqué par le provider.",
    });

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.revoked).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        severity: "critical",
        title: expect.stringContaining("notion"),
      }),
    );
  });
});

// ── Tests 0 token expirant ────────────────────────────────────

describe("aucun token expirant", () => {
  it("retourne 0 notifs et 0 webhook", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([]);

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.notificationsSent).toBe(0);
    expect(result.webhookDispatched).toBe(false);
    expect(mockDispatchWebhookEvent).not.toHaveBeenCalled();
  });
});

// ── Tests dryRun ──────────────────────────────────────────────

describe("dryRun=true", () => {
  it("ne dispatch pas le webhook en dryRun", async () => {
    mockCheckExpiringTokens.mockResolvedValueOnce([
      makeExpiring("c1", "slack", 5, "expiring_soon"),
    ]);
    mockRefreshOAuthToken.mockResolvedValueOnce({
      connectionId: "c1",
      appName: "slack",
      ok: true,
      outcome: "refreshed",
    });

    const result = await runCheckOAuthTokensJob(makePayload({ dryRun: true }));

    expect(result.ok).toBe(true);
    expect(result.webhookDispatched).toBe(false);
    expect(mockDispatchWebhookEvent).not.toHaveBeenCalled();
  });
});

// ── Tests checkExpiringTokens qui throw ──────────────────────

describe("erreurs inattendues", () => {
  it("absorbe une erreur de checkExpiringTokens sans throw", async () => {
    mockCheckExpiringTokens.mockRejectedValueOnce(
      new Error("Composio réseau KO"),
    );

    const result = await runCheckOAuthTokensJob(makePayload());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Composio réseau KO/);
  });
});

// ── Tests buildCheckOAuthTokensPayload ───────────────────────

describe("buildCheckOAuthTokensPayload", () => {
  it("construit un payload valide", () => {
    const payload = buildCheckOAuthTokensPayload(USER_ID, TENANT_ID);
    expect(payload.userId).toBe(USER_ID);
    expect(payload.tenantId).toBe(TENANT_ID);
    expect(payload.dryRun).toBe(false);
  });

  it("accepte dryRun=true", () => {
    const payload = buildCheckOAuthTokensPayload(USER_ID, TENANT_ID, {
      dryRun: true,
    });
    expect(payload.dryRun).toBe(true);
  });

  it("throw si userId invalide", () => {
    expect(() =>
      buildCheckOAuthTokensPayload("not-a-uuid", TENANT_ID),
    ).toThrow();
  });
});

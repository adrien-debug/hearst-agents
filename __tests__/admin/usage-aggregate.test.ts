/**
 * Tests — `lib/admin/usage/aggregate.ts`.
 *
 * Mock getServerSupabase pour qu'il renvoie un client factice qui retourne
 * des fixtures par table. On vérifie que les agrégats par tenant et la time
 * series sont corrects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface RunRowFixture {
  user_id: string | null;
  tenant_id?: string | null;
  cost_usd: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  kind: string;
}

interface MissionRowFixture {
  user_id: string | null;
  created_at: string;
}

interface AssetRowFixture {
  thread_id: string;
  created_at: string;
  provenance: { tenantId?: string; userId?: string } | null;
}

interface UserRowFixture {
  id: string;
  tenant_ids: string[] | null;
}

let runs: RunRowFixture[] = [];
let missions: MissionRowFixture[] = [];
let assets: AssetRowFixture[] = [];
let users: UserRowFixture[] = [];

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => {
    const tableHandler = (rows: unknown[]) => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_cols: string) => {
        const builder = {
          _rows: [...rows],
          gte(_col: string, _val: string) {
            return this;
          },
          lt(_col: string, _val: string) {
            return this;
          },
          eq(col: string, val: string) {
            this._rows = this._rows.filter(
              (r) => (r as Record<string, unknown>)[col] === val,
            );
            return this;
          },
          then(resolve: (v: { data: unknown[]; error: null }) => void) {
            resolve({ data: this._rows, error: null });
          },
        };
        return builder;
      },
    });
    return {
      from: (table: string) => {
        if (table === "runs") return tableHandler(runs);
        if (table === "missions") return tableHandler(missions);
        if (table === "assets") return tableHandler(assets);
        if (table === "users") return tableHandler(users);
        return tableHandler([]);
      },
    };
  }),
}));

import {
  getCrossTenantOverview,
  getTopTenants,
  getTenantUsage,
  getCrossTenantTimeSeries,
} from "@/lib/admin/usage/aggregate";

const RANGE = {
  start: "2026-04-01T00:00:00.000Z",
  end: "2026-05-01T00:00:00.000Z",
};

describe("usage aggregate", () => {
  beforeEach(() => {
    users = [
      { id: "u-1", tenant_ids: ["tenant-A"] },
      { id: "u-2", tenant_ids: ["tenant-A"] },
      { id: "u-3", tenant_ids: ["tenant-B"] },
    ];
    runs = [
      {
        user_id: "u-1",
        cost_usd: 0.5,
        tokens_in: 100,
        tokens_out: 50,
        created_at: "2026-04-10T10:00:00.000Z",
        kind: "chat",
      },
      {
        user_id: "u-2",
        cost_usd: 1.0,
        tokens_in: 200,
        tokens_out: 100,
        created_at: "2026-04-11T11:00:00.000Z",
        kind: "chat",
      },
      {
        user_id: "u-3",
        cost_usd: 0.25,
        tokens_in: 80,
        tokens_out: 40,
        created_at: "2026-04-15T09:00:00.000Z",
        kind: "research",
      },
    ];
    missions = [
      { user_id: "u-1", created_at: "2026-04-12T08:00:00.000Z" },
      { user_id: "u-3", created_at: "2026-04-13T08:00:00.000Z" },
    ];
    assets = [
      {
        thread_id: "th-1",
        created_at: "2026-04-12T08:30:00.000Z",
        provenance: { tenantId: "tenant-A", userId: "u-1" },
      },
      {
        thread_id: "th-2",
        created_at: "2026-04-13T08:30:00.000Z",
        provenance: { tenantId: "tenant-B", userId: "u-3" },
      },
    ];
  });

  it("getCrossTenantOverview agrège correctement", async () => {
    const overview = await getCrossTenantOverview(RANGE);
    expect(overview.totalRuns).toBe(3);
    expect(overview.totalCostUsd).toBeCloseTo(1.75, 4);
    expect(overview.totalTenants).toBe(2);
    expect(overview.totalActiveUsers).toBe(3);
    expect(overview.totalMissions).toBe(2);
    expect(overview.totalAssets).toBe(2);
  });

  it("getTopTenants ordonne par cost desc", async () => {
    const top = await getTopTenants(RANGE, 10);
    expect(top.length).toBe(2);
    expect(top[0].tenantId).toBe("tenant-A");
    expect(top[0].totalRuns).toBe(2);
    expect(top[0].totalCostUsd).toBeCloseTo(1.5, 4);
    expect(top[0].activeUsers).toBe(2);
    expect(top[1].tenantId).toBe("tenant-B");
    expect(top[1].totalCostUsd).toBeCloseTo(0.25, 4);
  });

  it("getTenantUsage renvoie le drill-down user-by-user", async () => {
    const detail = await getTenantUsage("tenant-A", RANGE);
    expect(detail.totalRuns).toBe(2);
    expect(detail.activeUsers).toBe(2);
    expect(detail.users).toHaveLength(2);
    const top = detail.users[0];
    expect(top.userId).toBe("u-2");
    expect(top.runs).toBe(1);
  });

  it("getCrossTenantTimeSeries bucketise par jour", async () => {
    const series = await getCrossTenantTimeSeries(RANGE, "day");
    expect(series.length).toBe(3);
    expect(series.every((p) => p.runs >= 1)).toBe(true);
    const total = series.reduce((acc, p) => acc + p.runs, 0);
    expect(total).toBe(3);
  });

  it("filtre par kind", async () => {
    const overview = await getCrossTenantOverview(RANGE, "research");
    expect(overview.totalRuns).toBe(1);
    expect(overview.totalCostUsd).toBeCloseTo(0.25, 4);
  });

  it("préfère runs.tenant_id directe à l'heuristique users", async () => {
    // Cas typique post-migration 0051 : la denormalisation prime, et les runs
    // dont le user_id n'existe pas dans la table users doivent quand même être
    // classés correctement (avant la migration ils ressortaient en "unknown").
    users = []; // pas de mapping users → forcerait "unknown" sans tenant_id direct
    runs = [
      {
        user_id: "u-orphan",
        tenant_id: "tenant-direct",
        cost_usd: 2,
        tokens_in: 10,
        tokens_out: 5,
        created_at: "2026-04-10T10:00:00.000Z",
        kind: "chat",
      },
      {
        user_id: "u-orphan-2",
        tenant_id: "tenant-direct",
        cost_usd: 3,
        tokens_in: 20,
        tokens_out: 10,
        created_at: "2026-04-11T10:00:00.000Z",
        kind: "chat",
      },
    ];
    missions = [];
    assets = [];

    const top = await getTopTenants(RANGE, 10);
    expect(top.length).toBe(1);
    expect(top[0].tenantId).toBe("tenant-direct");
    expect(top[0].totalRuns).toBe(2);
    expect(top[0].totalCostUsd).toBeCloseTo(5, 4);
  });

  it("fallback users.tenant_ids[0] si runs.tenant_id absent", async () => {
    // Cas runs antérieurs au backfill (tenant_id null) : on doit toujours
    // résoudre via la table users.
    users = [{ id: "u-1", tenant_ids: ["tenant-legacy"] }];
    runs = [
      {
        user_id: "u-1",
        tenant_id: null,
        cost_usd: 1,
        tokens_in: 5,
        tokens_out: 3,
        created_at: "2026-04-10T10:00:00.000Z",
        kind: "chat",
      },
    ];
    missions = [];
    assets = [];

    const top = await getTopTenants(RANGE, 10);
    expect(top.length).toBe(1);
    expect(top[0].tenantId).toBe("tenant-legacy");
  });
});

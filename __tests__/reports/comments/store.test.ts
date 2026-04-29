/**
 * Tests du store report_comments — Supabase mocké en mémoire.
 *
 * Ces tests valident :
 *   - validation Zod (input invalide → throw)
 *   - addComment → row inséré, retourné
 *   - listComments → filtre tenant + asset
 *   - deleteComment → ownership strict (auteur uniquement)
 *   - tenant isolation : un user du tenant B ne peut pas delete une row tenant A
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  addComment,
  listComments,
  deleteComment,
  type AddCommentInput,
} from "@/lib/reports/comments/store";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock Supabase minimal ────────────────────────────────────

interface Row {
  id: string;
  asset_id: string;
  tenant_id: string;
  user_id: string;
  block_ref: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

class FakeQuery {
  private filters: Array<{ col: string; val: unknown }> = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private operation: "select" | "insert" | "delete" | "update" = "select";
  private payload: Partial<Row> | null = null;

  constructor(private store: { rows: Row[] }) {}

  select(_cols?: string) {
    this.operation = "select";
    return this;
  }
  insert(payload: Partial<Row>) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  update(_p: unknown) {
    this.operation = "update";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    return this.exec().then((r) => ({
      data: r.data?.[0] ?? null,
      error: r.error,
    }));
  }
  maybeSingle() {
    return this.exec().then((r) => ({
      data: r.data?.[0] ?? null,
      error: r.error,
    }));
  }
  then<T>(onFulfilled: (r: { data: Row[] | null; error: { message: string } | null }) => T) {
    return this.exec().then(onFulfilled);
  }
  private async exec(): Promise<{ data: Row[] | null; error: { message: string } | null }> {
    if (this.operation === "insert" && this.payload) {
      const row: Row = {
        id: this.payload.id ?? `row_${this.store.rows.length + 1}`,
        asset_id: this.payload.asset_id ?? "",
        tenant_id: this.payload.tenant_id ?? "",
        user_id: this.payload.user_id ?? "",
        block_ref: this.payload.block_ref ?? null,
        body: this.payload.body ?? "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.store.rows.push(row);
      return { data: [row], error: null };
    }

    let out = this.store.rows.filter((r) =>
      this.filters.every((f) => (r as unknown as Record<string, unknown>)[f.col] === f.val),
    );

    if (this.operation === "delete") {
      this.store.rows = this.store.rows.filter((r) => !out.includes(r));
      return { data: null, error: null };
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[col] as string;
        const bv = (b as unknown as Record<string, unknown>)[col] as string;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return { data: out, error: null };
  }
}

function makeFakeClient(): { client: SupabaseClient; store: { rows: Row[] } } {
  const store = { rows: [] as Row[] };
  const client = {
    from: () => new FakeQuery(store),
  } as unknown as SupabaseClient;
  return { client, store };
}

// ── Tests ────────────────────────────────────────────────────

const baseInput: AddCommentInput = {
  assetId: "asset_1",
  tenantId: "tenant_a",
  userId: "user_1",
  blockRef: null,
  body: "First comment",
};

describe("addComment", () => {
  it("insère un commentaire valide et retourne la row mappée", async () => {
    const { client, store } = makeFakeClient();
    const created = await addComment(baseInput, client);
    expect(created).not.toBeNull();
    expect(created?.assetId).toBe("asset_1");
    expect(created?.userId).toBe("user_1");
    expect(created?.body).toBe("First comment");
    expect(store.rows.length).toBe(1);
  });

  it("throw sur body vide (Zod)", async () => {
    const { client } = makeFakeClient();
    await expect(addComment({ ...baseInput, body: "" }, client)).rejects.toThrow();
  });

  it("throw sur body > 4000 chars", async () => {
    const { client } = makeFakeClient();
    await expect(
      addComment({ ...baseInput, body: "a".repeat(4001) }, client),
    ).rejects.toThrow();
  });

  it("accepte blockRef pour scoper un commentaire à un bloc précis", async () => {
    const { client } = makeFakeClient();
    const c = await addComment(
      { ...baseInput, blockRef: "kpi_arr", body: "scoped" },
      client,
    );
    expect(c?.blockRef).toBe("kpi_arr");
  });
});

describe("listComments", () => {
  let client: SupabaseClient;
  let store: { rows: Row[] };

  beforeEach(async () => {
    const f = makeFakeClient();
    client = f.client;
    store = f.store;
    // seed
    await addComment({ ...baseInput, body: "c1" }, client);
    await addComment({ ...baseInput, body: "c2", blockRef: "kpi_arr" }, client);
    await addComment(
      { ...baseInput, tenantId: "tenant_b", userId: "user_2", body: "c_other_tenant" },
      client,
    );
    await addComment({ ...baseInput, assetId: "asset_2", body: "c_other_asset" }, client);
  });

  it("filtre par asset + tenant", async () => {
    const out = await listComments(
      { assetId: "asset_1", tenantId: "tenant_a", limit: 100 },
      client,
    );
    expect(out.length).toBe(2);
    expect(out.every((c) => c.tenantId === "tenant_a")).toBe(true);
    expect(out.every((c) => c.assetId === "asset_1")).toBe(true);
  });

  it("filtre par blockRef si fourni", async () => {
    const out = await listComments(
      { assetId: "asset_1", tenantId: "tenant_a", blockRef: "kpi_arr", limit: 100 },
      client,
    );
    expect(out.length).toBe(1);
    expect(out[0].blockRef).toBe("kpi_arr");
  });

  it("retourne [] si tenant inconnu", async () => {
    const out = await listComments(
      { assetId: "asset_1", tenantId: "tenant_unknown", limit: 100 },
      client,
    );
    expect(out).toEqual([]);
  });

  it("ne fuit PAS les rows d'un autre tenant", async () => {
    expect(store.rows.some((r) => r.tenant_id === "tenant_b")).toBe(true);
    const out = await listComments(
      { assetId: "asset_1", tenantId: "tenant_a", limit: 100 },
      client,
    );
    expect(out.every((c) => c.tenantId === "tenant_a")).toBe(true);
  });
});

describe("deleteComment", () => {
  it("auteur peut supprimer son commentaire", async () => {
    const { client } = makeFakeClient();
    const created = await addComment(baseInput, client);
    expect(created).not.toBeNull();
    if (!created) return;
    const r = await deleteComment(
      { commentId: created.id, userId: "user_1", tenantId: "tenant_a" },
      client,
    );
    expect(r.ok).toBe(true);
  });

  it("non-auteur même tenant → forbidden", async () => {
    const { client } = makeFakeClient();
    const created = await addComment(baseInput, client);
    if (!created) return;
    const r = await deleteComment(
      { commentId: created.id, userId: "user_2", tenantId: "tenant_a" },
      client,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");
  });

  it("auteur mais autre tenant → forbidden (tenant isolation)", async () => {
    const { client } = makeFakeClient();
    const created = await addComment(baseInput, client);
    if (!created) return;
    const r = await deleteComment(
      { commentId: created.id, userId: "user_1", tenantId: "tenant_b" },
      client,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("forbidden");
  });

  it("commentId inconnu → not_found", async () => {
    const { client } = makeFakeClient();
    const r = await deleteComment(
      { commentId: "missing", userId: "user_1", tenantId: "tenant_a" },
      client,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });
});

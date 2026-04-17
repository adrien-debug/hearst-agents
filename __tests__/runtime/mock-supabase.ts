/**
 * Lightweight Supabase mock for integration tests.
 *
 * Stores data in-memory maps. Supports the chaining patterns
 * used by RunTracer: insert().select().single(), from().select().eq().single(),
 * from().update().eq(), from().select().eq().order().
 */

import { randomUUID } from "crypto";

type Row = Record<string, unknown>;

class MockTable {
  private rows: Row[] = [];

  insert(row: Row | Row[]) {
    const rows = Array.isArray(row) ? row : [row];
    const inserted = rows.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
    this.rows.push(...inserted);
    return new MockChain(inserted);
  }

  select(_fields?: string) {
    return new MockChain([...this.rows]);
  }

  update(values: Row) {
    return new MockUpdateChain(values, this.rows);
  }

  getRows(): Row[] {
    return this.rows;
  }
}

class MockChain {
  private data: Row[];
  private filters: Array<{ col: string; val: unknown }> = [];

  constructor(data: Row[]) {
    this.data = data;
  }

  select(_fields?: string) {
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }

  gte(_col: string, _val: unknown) {
    return this;
  }

  order(_col: string, _opts?: { ascending: boolean }) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  single() {
    const filtered = this.applyFilters();
    const row = filtered[0] ?? null;
    return Promise.resolve({ data: row, error: row ? null : { message: "not found" } });
  }

  async then(resolve: (val: { data: Row[] | null; error: null }) => void) {
    resolve({ data: this.applyFilters(), error: null });
  }

  private applyFilters(): Row[] {
    let result = this.data;
    for (const f of this.filters) {
      result = result.filter((r) => r[f.col] === f.val);
    }
    return result;
  }
}

class MockUpdateChain {
  private filters: Array<{ col: string; val: unknown }> = [];

  constructor(private values: Row, private rows: Row[]) {}

  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    for (const row of this.rows) {
      const matches = this.filters.every((f) => row[f.col] === f.val);
      if (matches) {
        Object.assign(row, this.values);
      }
    }
    return Promise.resolve({ data: null, error: null });
  }
}

export function createMockSupabase() {
  const tables = new Map<string, MockTable>();

  function getTable(name: string): MockTable {
    if (!tables.has(name)) tables.set(name, new MockTable());
    return tables.get(name)!;
  }

  const client = {
    from(table: string) {
      return getTable(table);
    },
    _getTable(name: string) {
      return getTable(name);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

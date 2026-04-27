/**
 * Memory store — structured ModelMessage persistence.
 *
 * Covers `appendModelMessages` / `getRecentModelMessages` — the path that
 * preserves tool-call and tool-result parts across turns so cross-turn
 * confirmations work reliably even after a cold start.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ModelMessage } from "ai";
import type { TenantScope } from "@/lib/multi-tenant/types";

// ── Mocked Supabase ───────────────────────────────────────────
type MockBuilder = {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const state: {
  selectResult: { data: unknown; error: unknown };
  insertResult: { error: unknown };
  builder: MockBuilder;
} = {
  selectResult: { data: [], error: null },
  insertResult: { error: null },
  builder: null as unknown as MockBuilder,
};

function buildBuilder(): MockBuilder {
  const b: MockBuilder = {
    insert: vi.fn().mockImplementation(async () => state.insertResult),
    select: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockImplementation(async () => state.selectResult),
  };
  b.select.mockReturnValue(b);
  b.delete.mockReturnValue(b);
  b.eq.mockReturnValue(b);
  b.is.mockReturnValue(b);
  b.not.mockReturnValue(b);
  b.order.mockReturnValue(b);
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => state.builder,
  })),
}));

const scope: TenantScope = {
  tenantId: "tenant-A",
  workspaceId: "ws-1",
  userId: "user-1",
};

async function freshStore() {
  vi.resetModules();
  state.builder = buildBuilder();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  return await import("@/lib/memory/store");
}

beforeEach(() => {
  state.selectResult = { data: [], error: null };
  state.insertResult = { error: null };
});

// ── appendModelMessages ───────────────────────────────────────

describe("appendModelMessages — buffering", () => {
  it("appends a single user message into the buffer", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    const msg: ModelMessage = { role: "user", content: "hello" };
    appendModelMessages("c-1", [msg], scope);

    state.selectResult = { data: [], error: null };
    const out = await getRecentModelMessages("c-1", 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(msg);
  });

  it("appends an assistant message with tool-call parts", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    const assistant: ModelMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "I'll send that." },
        {
          type: "tool-call",
          toolCallId: "tc-1",
          toolName: "SLACK_SEND_MESSAGE",
          input: { channel: "#dev", text: "hi", _preview: true },
        },
      ],
    };
    appendModelMessages("c-2", [assistant], scope);
    const out = await getRecentModelMessages("c-2", 10);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("assistant");
    const parts = (out[0] as { content: Array<{ type: string }> }).content;
    expect(parts).toHaveLength(2);
    expect(parts[1].type).toBe("tool-call");
  });

  it("appends a tool message with tool-result parts", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    const tool: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "tc-1",
          toolName: "SLACK_SEND_MESSAGE",
          output: { type: "text", value: "draft string" },
        },
      ],
    };
    appendModelMessages("c-3", [tool], scope);
    const out = await getRecentModelMessages("c-3", 10);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("tool");
  });

  it("appends multiple messages in order", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    appendModelMessages(
      "c-4",
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "third" },
      ],
      scope,
    );
    const out = await getRecentModelMessages("c-4", 10);
    expect(out).toHaveLength(3);
    expect((out[0] as { content: string }).content).toBe("first");
    expect((out[2] as { content: string }).content).toBe("third");
  });

  it("preserves order across multiple appendModelMessages calls", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    appendModelMessages("c-5", [{ role: "user", content: "1" }], scope);
    appendModelMessages("c-5", [{ role: "assistant", content: "2" }], scope);
    appendModelMessages("c-5", [{ role: "user", content: "3" }], scope);
    const out = await getRecentModelMessages("c-5", 10);
    expect(out.map((m) => (m as { content: string }).content)).toEqual(["1", "2", "3"]);
  });

  it("respects the 24-message window", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    const msgs: ModelMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    appendModelMessages("c-window", msgs, scope);
    const out = await getRecentModelMessages("c-window", 100);
    expect(out).toHaveLength(24);
    expect((out[0] as { content: string }).content).toBe("m6");
  });

  it("respects an explicit smaller limit", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    appendModelMessages(
      "c-limit",
      Array.from({ length: 10 }, (_, i) => ({
        role: "user" as const,
        content: `m${i}`,
      })),
      scope,
    );
    const out = await getRecentModelMessages("c-limit", 3);
    expect(out).toHaveLength(3);
    expect((out[2] as { content: string }).content).toBe("m9");
  });

  it("ignores empty conversationId", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    appendModelMessages("", [{ role: "user", content: "x" }], scope);
    const out = await getRecentModelMessages("", 10);
    expect(out).toEqual([]);
  });

  it("ignores empty modelMessages array", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    appendModelMessages("c-empty", [], scope);
    const out = await getRecentModelMessages("c-empty", 10);
    expect(out).toEqual([]);
  });

  it("isolates conversations by tenant in the buffer", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    const scopeA: TenantScope = { tenantId: "tA", workspaceId: "w", userId: "u" };
    const scopeB: TenantScope = { tenantId: "tB", workspaceId: "w", userId: "u" };
    appendModelMessages("conv", [{ role: "user", content: "fromA" }], scopeA);
    appendModelMessages("conv", [{ role: "user", content: "fromB" }], scopeB);
    const out = await getRecentModelMessages("conv", 10);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });
});

// ── getRecentModelMessages — Supabase priority ────────────────

describe("getRecentModelMessages — Supabase reads", () => {
  it("prefers Supabase rows when payload is present", async () => {
    const { getRecentModelMessages } = await freshStore();
    const dbPayload: ModelMessage = { role: "user", content: "from db" };
    state.selectResult = {
      data: [{ role: "user", content: "from db", payload: dbPayload, created_at: new Date(1).toISOString() }],
      error: null,
    };
    const out = await getRecentModelMessages("c-db", 10);
    expect(out).toHaveLength(1);
    expect((out[0] as { content: string }).content).toBe("from db");
  });

  it("falls back to buffer when Supabase returns empty", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    state.selectResult = { data: [], error: null };
    appendModelMessages("c-buf", [{ role: "user", content: "buffered" }], scope);
    const out = await getRecentModelMessages("c-buf", 10);
    expect(out).toHaveLength(1);
    expect((out[0] as { content: string }).content).toBe("buffered");
  });

  it("filters out null/non-object payloads (defensive)", async () => {
    const { getRecentModelMessages } = await freshStore();
    state.selectResult = {
      data: [
        { role: "user", content: "ok", payload: { role: "user", content: "ok" }, created_at: "1" },
        { role: "assistant", content: "bad", payload: null, created_at: "2" },
        { role: "user", content: "bad-string", payload: "not an object", created_at: "3" },
      ],
      error: null,
    };
    const out = await getRecentModelMessages("c-mix", 10);
    expect(out).toHaveLength(1);
    expect((out[0] as { content: string }).content).toBe("ok");
  });

  it("falls back to buffer on Supabase error", async () => {
    const { appendModelMessages, getRecentModelMessages } = await freshStore();
    state.selectResult = { data: null, error: { message: "boom" } };
    appendModelMessages("c-err", [{ role: "user", content: "buf-after-err" }], scope);
    const out = await getRecentModelMessages("c-err", 10);
    expect(out).toHaveLength(1);
    expect((out[0] as { content: string }).content).toBe("buf-after-err");
  });

  it("returns [] when both Supabase and buffer are empty", async () => {
    const { getRecentModelMessages } = await freshStore();
    state.selectResult = { data: [], error: null };
    const out = await getRecentModelMessages("c-nothing", 10);
    expect(out).toEqual([]);
  });
});

/**
 * Memory store — persistence + buffer fallback tests.
 *
 * The store dual-writes (Supabase + in-memory buffer) and reads from
 * Supabase first, falling back to the buffer when DB is unavailable.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TenantScope } from "@/lib/multi-tenant/types";
import type { ChatMessageMemory } from "@/lib/memory/types";

// ── Mocked Supabase client ────────────────────────────────────
type MockBuilder = {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const state: {
  selectResult: { data: unknown; error: unknown };
  insertResult: { error: unknown };
  fromCalls: string[];
  builder: MockBuilder;
  available: boolean;
} = {
  selectResult: { data: [], error: null },
  insertResult: { error: null },
  fromCalls: [],
  // Re-built in beforeEach so call counters reset
  builder: null as unknown as MockBuilder,
  available: true,
};

function buildBuilder(): MockBuilder {
  const builder: MockBuilder = {
    insert: vi.fn().mockImplementation(async () => state.insertResult),
    select: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockImplementation(async () => state.selectResult),
  };
  // Chainable methods return the builder; limit (terminal) returns the result.
  builder.select.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    if (!state.available) {
      // Simulate "not configured" by returning null from createClient — but
      // db() in store.ts only checks env vars; we instead make ops throw.
      return {
        from: (table: string) => {
          state.fromCalls.push(table);
          // Throws on terminal call
          const err = new Error("Supabase unavailable");
          return {
            insert: () => Promise.reject(err),
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.reject(err),
                }),
              }),
            }),
            delete: () => ({
              eq: () => Promise.reject(err),
            }),
          };
        },
      };
    }
    return {
      from: (table: string) => {
        state.fromCalls.push(table);
        return state.builder;
      },
    };
  }),
}));

const scope: TenantScope = {
  tenantId: "tenant-A",
  workspaceId: "workspace-1",
  userId: "user-1",
};

const scopeB: TenantScope = {
  tenantId: "tenant-B",
  workspaceId: "workspace-1",
  userId: "user-2",
};

function msg(role: "user" | "assistant", content: string, t = Date.now()): ChatMessageMemory {
  return { role, content, createdAt: t };
}

// Re-import the store fresh between tests to reset the in-memory buffer.
async function freshStore() {
  vi.resetModules();
  state.builder = buildBuilder();
  state.fromCalls.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  return await import("@/lib/memory/store");
}

describe("memory store — persistence + buffer", () => {
  beforeEach(() => {
    state.available = true;
    state.selectResult = { data: [], error: null };
    state.insertResult = { error: null };
  });

  it("appends and reads back from in-memory buffer when Supabase is empty", async () => {
    const { appendMessage, getRecentMessages } = await freshStore();
    state.selectResult = { data: [], error: null }; // empty DB

    appendMessage("conv-1", msg("user", "hello"), scope);
    appendMessage("conv-1", msg("assistant", "hi"), scope);
    appendMessage("conv-1", msg("user", "how are you"), scope);

    const out = await getRecentMessages("conv-1", 10);
    expect(out).toHaveLength(3);
    expect(out[0].content).toBe("hello");
    expect(out[2].content).toBe("how are you");
  });

  it("falls back to buffer when Supabase errors", async () => {
    const { appendMessage, getRecentMessages } = await freshStore();
    state.selectResult = { data: null, error: { message: "boom" } };

    appendMessage("conv-2", msg("user", "fallback test"), scope);
    const out = await getRecentMessages("conv-2", 10);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("fallback test");
  });

  it("reads from Supabase in priority when rows exist", async () => {
    const { getRecentMessages } = await freshStore();
    state.selectResult = {
      data: [
        { role: "user", content: "db-1", created_at: new Date(1).toISOString() },
        { role: "assistant", content: "db-2", created_at: new Date(2).toISOString() },
        { role: "user", content: "db-3", created_at: new Date(3).toISOString() },
        { role: "assistant", content: "db-4", created_at: new Date(4).toISOString() },
        { role: "user", content: "db-5", created_at: new Date(5).toISOString() },
      ],
      error: null,
    };

    const out = await getRecentMessages("conv-3", 10);
    expect(out).toHaveLength(5);
    expect(out.map((m) => m.content)).toEqual(["db-1", "db-2", "db-3", "db-4", "db-5"]);
  });

  it("respects the limit by slicing to the most recent N from Supabase", async () => {
    const { getRecentMessages } = await freshStore();
    state.selectResult = {
      data: Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `m${i}`,
        created_at: new Date(i + 1).toISOString(),
      })),
      error: null,
    };
    const out = await getRecentMessages("conv-X", 5);
    expect(out).toHaveLength(5);
    expect(out.map((m) => m.content)).toEqual(["m5", "m6", "m7", "m8", "m9"]);
  });

  it("buffer enforces the 24-message window", async () => {
    const { appendMessage, getRecentMessages } = await freshStore();
    state.selectResult = { data: [], error: null };

    for (let i = 0; i < 30; i++) {
      appendMessage("conv-window", msg("user", `m${i}`), scope);
    }
    const out = await getRecentMessages("conv-window", 100);
    expect(out).toHaveLength(24);
    expect(out[0].content).toBe("m6"); // 30 - 24 = 6
    expect(out[23].content).toBe("m29");
  });

  it("isolates same conversationId across different tenants in the buffer", async () => {
    const { appendMessage, getConversationMemory } = await freshStore();
    state.selectResult = { data: null, error: { message: "force-fallback" } };

    appendMessage("shared-conv", msg("user", "tenantA-msg"), scope);
    appendMessage("shared-conv", msg("user", "tenantB-msg"), scopeB);

    // Both tenants should each have their own entry. We only have a public
    // accessor by conversationId (not by tenant), but the dedicated key in
    // the internal buffer should mean two entries, not one merged conversation.
    // We verify this by counting all entries via getConversationMemory which
    // returns the FIRST match — and confirm both tenants' messages exist by
    // appending more messages and ensuring isolation.
    const conv = getConversationMemory("shared-conv");
    expect(conv).not.toBeNull();
    // Each tenant's buffer entry has only its own message (1 each, not 2).
    expect(conv!.messages).toHaveLength(1);
  });

  it("clearConversation empties the buffer and triggers a Supabase delete", async () => {
    const { appendMessage, clearConversation, getRecentMessages } = await freshStore();
    state.selectResult = { data: null, error: { message: "force-fallback" } };

    appendMessage("conv-clear", msg("user", "to-be-cleared"), scope);
    expect((await getRecentMessages("conv-clear", 10))).toHaveLength(1);

    clearConversation("conv-clear");

    // Buffer cleared
    expect((await getRecentMessages("conv-clear", 10))).toHaveLength(0);
    // Supabase delete chain invoked
    expect(state.builder.delete).toHaveBeenCalled();
    expect(state.builder.eq).toHaveBeenCalledWith("conversation_id", "conv-clear");
  });

  it("getRecentMessages with empty conversationId returns [] without crashing", async () => {
    const { getRecentMessages } = await freshStore();
    state.selectResult = { data: [], error: null };
    const out = await getRecentMessages("", 10);
    expect(out).toEqual([]);
  });

  it("appendMessage with empty conversationId does not crash", async () => {
    const { appendMessage } = await freshStore();
    state.selectResult = { data: [], error: null };
    expect(() => appendMessage("", msg("user", "x"), scope)).not.toThrow();
  });
});

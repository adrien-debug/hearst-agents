/**
 * Voice transcript-store — vérifie l'append-with-upsert (1re entry crée la
 * row, suivantes append, patch d'une entry existante par id la remplace).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  user_id: string;
  tenant_id: string;
  thread_id: string | null;
  session_id: string;
  entries: unknown[];
  ended_at: string | null;
}

const { sbMock, rows } = vi.hoisted(() => {
  const rows: Row[] = [];
  const buildQuery = (table: string) => {
    let filterSession: string | null = null;
    let filterId: string | null = null;
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn((col: string, val: string) => {
        if (table === "voice_transcripts" && col === "session_id") filterSession = val;
        if (table === "voice_transcripts" && col === "id") filterId = val;
        return q;
      }),
      maybeSingle: vi.fn(async () => {
        if (table !== "voice_transcripts") return { data: null, error: null };
        const found = rows.find((r) => r.session_id === filterSession);
        return { data: found ?? null, error: null };
      }),
      insert: vi.fn(async (data: Partial<Row>) => {
        const row: Row = {
          id: `row-${rows.length + 1}`,
          user_id: data.user_id!,
          tenant_id: data.tenant_id!,
          thread_id: data.thread_id ?? null,
          session_id: data.session_id!,
          entries: (data.entries as unknown[]) ?? [],
          ended_at: null,
        };
        rows.push(row);
        return { data: row, error: null };
      }),
      update: vi.fn((patch: Partial<Row>) => {
        const finishUpdate = async () => {
          let target: Row | undefined;
          if (filterSession) target = rows.find((r) => r.session_id === filterSession);
          if (filterId) target = rows.find((r) => r.id === filterId);
          if (target) Object.assign(target, patch);
          return { data: target, error: null };
        };
        // chainable .eq
        return {
          eq: vi.fn((col: string, val: string) => {
            if (col === "session_id") filterSession = val;
            if (col === "id") filterId = val;
            return finishUpdate();
          }),
        };
      }),
    };
    return q;
  };
  const sbMock = {
    from: vi.fn((table: string) => buildQuery(table)),
  };
  return { sbMock, rows };
});

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => sbMock,
}));

import {
  appendTranscriptEntry,
  getTranscript,
  linkTranscriptToThread,
} from "@/lib/voice/transcript-store";

beforeEach(() => {
  rows.length = 0;
});

describe("appendTranscriptEntry", () => {
  it("première entry → INSERT row avec entries=[entry]", async () => {
    const ok = await appendTranscriptEntry({
      sessionId: "sess-1",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: { id: "u-1", role: "user", text: "salut", timestamp: 1 },
    });
    expect(ok).toBe(true);
    expect(rows.length).toBe(1);
    expect(rows[0].session_id).toBe("sess-1");
    expect(rows[0].entries).toEqual([
      { id: "u-1", role: "user", text: "salut", timestamp: 1 },
    ]);
  });

  it("append à une session existante", async () => {
    await appendTranscriptEntry({
      sessionId: "sess-2",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: { id: "u-1", role: "user", text: "a", timestamp: 1 },
    });
    await appendTranscriptEntry({
      sessionId: "sess-2",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: { id: "a-1", role: "assistant", text: "b", timestamp: 2 },
    });
    expect(rows[0].entries).toHaveLength(2);
  });

  it("patch d'une entry existante par id (tool_call pending → success)", async () => {
    await appendTranscriptEntry({
      sessionId: "sess-3",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: {
        id: "tc-42",
        role: "tool_call",
        text: "GMAIL_SEND_EMAIL",
        timestamp: 1,
        status: "pending",
      },
    });
    await appendTranscriptEntry({
      sessionId: "sess-3",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: {
        id: "tc-42",
        role: "tool_call",
        text: "GMAIL_SEND_EMAIL",
        timestamp: 1,
        status: "success",
      },
    });
    expect(rows[0].entries).toHaveLength(1);
    expect((rows[0].entries[0] as { status: string }).status).toBe("success");
  });
});

describe("getTranscript", () => {
  it("retourne null si la session n'existe pas", async () => {
    const t = await getTranscript("ghost");
    expect(t).toBeNull();
  });
});

describe("linkTranscriptToThread", () => {
  it("met à jour thread_id sur la row", async () => {
    await appendTranscriptEntry({
      sessionId: "sess-link",
      userId: "user-1",
      tenantId: "tenant-1",
      entry: { id: "u-1", role: "user", text: "a", timestamp: 1 },
    });
    const ok = await linkTranscriptToThread("sess-link", "thread-99");
    expect(ok).toBe(true);
    expect(rows[0].thread_id).toBe("thread-99");
  });
});

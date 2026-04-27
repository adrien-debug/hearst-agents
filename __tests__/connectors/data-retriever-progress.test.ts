import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/auth/tokens", () => ({
  getTokens: vi.fn(async () => ({ accessToken: "tok-test" })),
}));

vi.mock("@/lib/connectors/google/calendar", () => ({
  getTodayEvents: vi.fn(async () => []),
}));

vi.mock("@/lib/connectors/google/gmail", () => ({
  getRecentEmails: vi.fn(async () => []),
}));

vi.mock("@/lib/connectors/google/drive", () => ({
  getRecentFiles: vi.fn(async () => []),
}));

import { DataRetriever } from "@/lib/connectors/data-retriever";

describe("DataRetriever — onProgress callbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls start/end for each provider in order on the success path", async () => {
    const events: Array<["start" | "end", string, boolean?]> = [];
    const retriever = new DataRetriever("user-1");

    await retriever.retrieveAll({
      start: (p) => events.push(["start", p]),
      end: (p, ok) => events.push(["end", p, ok]),
    });

    expect(events).toEqual([
      ["start", "calendar"],
      ["end", "calendar", true],
      ["start", "gmail"],
      ["end", "gmail", true],
      ["start", "drive"],
      ["end", "drive", true],
    ]);
  });

  it("emits end(_, false) when a provider read throws", async () => {
    const calMod = await import("@/lib/connectors/google/calendar");
    vi.mocked(calMod.getTodayEvents).mockRejectedValueOnce(new Error("boom"));

    const events: Array<["start" | "end", string, boolean?]> = [];
    const retriever = new DataRetriever("user-1");
    await retriever.retrieveAll({
      start: (p) => events.push(["start", p]),
      end: (p, ok) => events.push(["end", p, ok]),
    });

    expect(events[0]).toEqual(["start", "calendar"]);
    expect(events[1]).toEqual(["end", "calendar", false]);
  });

  it("does not call progress when no Google token is available", async () => {
    const tokensMod = await import("@/lib/platform/auth/tokens");
    vi.mocked(tokensMod.getTokens).mockResolvedValueOnce(null as never);

    const events: Array<["start" | "end", string, boolean?]> = [];
    const retriever = new DataRetriever("user-2");
    const ctx = await retriever.retrieveAll({
      start: (p) => events.push(["start", p]),
      end: (p, ok) => events.push(["end", p, ok]),
    });

    expect(events).toEqual([]);
    expect(ctx.hasCalendarAccess).toBe(false);
    expect(ctx.hasGmailAccess).toBe(false);
    expect(ctx.hasDriveAccess).toBe(false);
  });

  it("works without a progress callback (backwards compat)", async () => {
    const retriever = new DataRetriever("user-3");
    await expect(retriever.retrieveAll()).resolves.toMatchObject({
      hasCalendarAccess: true,
      hasGmailAccess: true,
      hasDriveAccess: true,
    });
  });
});

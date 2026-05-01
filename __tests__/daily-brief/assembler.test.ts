/**
 * Daily Brief assembler — tests fail-soft + normalisation par source.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecentEmails: vi.fn(),
  getTodayEvents: vi.fn(),
  executeComposioAction: vi.fn(),
}));

vi.mock("@/lib/connectors/google/gmail", () => ({
  getRecentEmails: mocks.getRecentEmails,
}));

vi.mock("@/lib/connectors/google/calendar", () => ({
  getTodayEvents: mocks.getTodayEvents,
}));

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: mocks.executeComposioAction,
}));

import { assembleDailyBriefData } from "@/lib/daily-brief/assembler";

describe("assembleDailyBriefData", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("retourne 5 listes vides + sources :error/:empty quand toutes sources échouent", async () => {
    mocks.getRecentEmails.mockRejectedValue(new Error("no auth"));
    mocks.getTodayEvents.mockRejectedValue(new Error("no auth"));
    mocks.executeComposioAction.mockResolvedValue({
      ok: false,
      error: "AUTH_REQUIRED",
      errorCode: "AUTH_REQUIRED",
    });

    const data = await assembleDailyBriefData({
      userId: "u1",
      tenantId: "t1",
    });

    expect(data.emails).toEqual([]);
    expect(data.calendar).toEqual([]);
    expect(data.slack).toEqual([]);
    expect(data.github).toEqual([]);
    expect(data.linear).toEqual([]);
    expect(data.sources).toContain("gmail:error");
    expect(data.sources).toContain("calendar:error");
    // Composio AUTH_REQUIRED → ok=false → sources :empty (pas error)
    expect(data.sources.find((s) => s.startsWith("slack"))).toBeDefined();
  });

  it("normalise les emails et applique le filtre 36h", async () => {
    const recent = new Date(Date.now() - 6 * 3600_000).toUTCString();
    const old = new Date(Date.now() - 72 * 3600_000).toUTCString();
    mocks.getRecentEmails.mockResolvedValue([
      {
        id: "m1",
        subject: "Recent email",
        sender: "Alice",
        snippet: "...",
        date: recent,
        isRead: false,
      },
      {
        id: "m2",
        subject: "Old email",
        sender: "Bob",
        snippet: "...",
        date: old,
        isRead: true,
      },
    ]);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.executeComposioAction.mockResolvedValue({ ok: false });

    const data = await assembleDailyBriefData({ userId: "u1", tenantId: "t1" });
    expect(data.emails).toHaveLength(1);
    expect(data.emails[0].subject).toBe("Recent email");
  });

  it("normalise les events agenda", async () => {
    mocks.getRecentEmails.mockResolvedValue([]);
    mocks.getTodayEvents.mockResolvedValue([
      {
        id: "e1",
        title: "Meeting Series A",
        startTime: "2026-05-01T09:00:00Z",
        endTime: "2026-05-01T09:45:00Z",
        attendees: ["sarah@sequoia.com"],
        location: "Zoom",
        isAllDay: false,
      },
    ]);
    mocks.executeComposioAction.mockResolvedValue({ ok: false });

    const data = await assembleDailyBriefData({ userId: "u1", tenantId: "t1" });
    expect(data.calendar).toHaveLength(1);
    expect(data.calendar[0].title).toBe("Meeting Series A");
    expect(data.calendar[0].attendees).toContain("sarah@sequoia.com");
  });

  it("normalise les Slack messages avec window 4h", async () => {
    mocks.getRecentEmails.mockResolvedValue([]);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.executeComposioAction.mockImplementation(async ({ action }) => {
      if (action === "SLACK_LIST_MESSAGES") {
        return {
          ok: true,
          data: {
            messages: [
              { channel: "C1", text: "Hello", ts: "1714539600.001", user: "U1" },
              { channel: "C2", text: "World", ts: "1714539700.001", user: "U2" },
            ],
          },
        };
      }
      return { ok: false };
    });

    const data = await assembleDailyBriefData({ userId: "u1", tenantId: "t1" });
    expect(data.slack).toHaveLength(2);
    expect(data.slack[0].text).toBe("Hello");
    expect(data.sources).toContain("slack");
  });

  it("normalise les GitHub PRs et infère le state merged/draft", async () => {
    mocks.getRecentEmails.mockResolvedValue([]);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.executeComposioAction.mockImplementation(async ({ action }) => {
      if (action === "GITHUB_LIST_PULLS") {
        return {
          ok: true,
          data: [
            {
              id: 1,
              number: 42,
              title: "PR ouverte",
              state: "open",
              draft: false,
              user: { login: "alice" },
              head: { repo: { full_name: "org/repo" } },
              html_url: "https://github.com/org/repo/pull/42",
              updated_at: "2026-04-29T10:00:00Z",
            },
            {
              id: 2,
              number: 43,
              title: "PR draft",
              state: "open",
              draft: true,
              user: { login: "bob" },
              head: { repo: { full_name: "org/repo" } },
              html_url: "x",
            },
          ],
        };
      }
      return { ok: false };
    });

    const data = await assembleDailyBriefData({ userId: "u1", tenantId: "t1" });
    expect(data.github).toHaveLength(2);
    expect(data.github[0].state).toBe("open");
    expect(data.github[1].state).toBe("draft");
    expect(data.github[0].repo).toBe("org/repo");
    expect(data.github[0].author).toBe("alice");
  });

  it("normalise les Linear issues + priority numerique", async () => {
    mocks.getRecentEmails.mockResolvedValue([]);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.executeComposioAction.mockImplementation(async ({ action }) => {
      if (action === "LINEAR_LIST_ISSUES") {
        return {
          ok: true,
          data: {
            issues: [
              {
                id: "L1",
                identifier: "ENG-118",
                title: "Bug staging",
                state: { name: "In Progress" },
                priority: 1,
                assignee: { name: "Léa" },
                url: "https://linear.app/x/issue/ENG-118",
              },
            ],
          },
        };
      }
      return { ok: false };
    });

    const data = await assembleDailyBriefData({ userId: "u1", tenantId: "t1" });
    expect(data.linear).toHaveLength(1);
    expect(data.linear[0].identifier).toBe("ENG-118");
    expect(data.linear[0].priority).toBe(1);
    expect(data.linear[0].assignee).toBe("Léa");
    expect(data.linear[0].state).toBe("In Progress");
  });

  it("respecte les limites par source", async () => {
    const manyEmails = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`,
      subject: `Email ${i}`,
      sender: "x",
      snippet: "",
      date: new Date().toUTCString(),
      isRead: false,
    }));
    mocks.getRecentEmails.mockResolvedValue(manyEmails);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.executeComposioAction.mockResolvedValue({ ok: false });

    const data = await assembleDailyBriefData({
      userId: "u1",
      tenantId: "t1",
      gmailLimit: 5,
    });
    // L'API getRecentEmails est mockée, on ne contrôle pas son slice — on
    // valide juste que le limit est passé correctement.
    expect(mocks.getRecentEmails).toHaveBeenCalledWith("u1", 5);
    expect(data.emails.length).toBeLessThanOrEqual(50);
  });
});

/**
 * Inbox Brief Generator — vérifie merge sources, fail-soft, classify, cap.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecentEmails: vi.fn(),
  getTodayEvents: vi.fn(),
  executeComposioAction: vi.fn(),
  isComposioConfigured: vi.fn(),
}));

vi.mock("@/lib/connectors/google/gmail", () => ({
  getRecentEmails: mocks.getRecentEmails,
}));

vi.mock("@/lib/connectors/google/calendar", () => ({
  getTodayEvents: mocks.getTodayEvents,
}));

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: mocks.executeComposioAction,
  isComposioConfigured: mocks.isComposioConfigured,
}));

import { generateInboxBrief } from "@/lib/inbox/inbox-brief";

describe("generateInboxBrief", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    delete process.env.ANTHROPIC_API_KEY;
    mocks.getRecentEmails.mockResolvedValue([]);
    mocks.getTodayEvents.mockResolvedValue([]);
    mocks.isComposioConfigured.mockReturnValue(false);
    mocks.executeComposioAction.mockResolvedValue({ ok: true, data: {} });
  });

  it("retourne un brief vide quand toutes les sources sont vides", async () => {
    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(brief.empty).toBe(true);
    expect(brief.items).toHaveLength(0);
    expect(brief.sources).toEqual(expect.arrayContaining(["gmail", "slack", "calendar"]));
  });

  it("agrège emails unread et tag info en heuristique", async () => {
    mocks.getRecentEmails.mockResolvedValue([
      {
        id: "m1",
        subject: "Réunion mardi",
        sender: "alice@acme.com",
        snippet: "On peut caler 14h ?",
        date: new Date().toISOString(),
        isRead: false,
      },
      {
        id: "m2",
        subject: "Re: budget",
        sender: "bob@acme.com",
        snippet: "Merci",
        date: new Date().toISOString(),
        isRead: true, // doit être filtré
      },
    ]);

    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(brief.items).toHaveLength(1);
    expect(brief.items[0].kind).toBe("email");
    expect(brief.items[0].id).toBe("email:m1");
    expect(brief.items[0].suggestedActions.find((a) => a.kind === "reply")).toBeTruthy();
  });

  it("agrège events Calendar today", async () => {
    mocks.getTodayEvents.mockResolvedValue([
      {
        id: "e1",
        title: "Daily standup",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        attendees: ["adrien@hearst.com"],
        location: "Zoom",
        isAllDay: false,
      },
    ]);

    const brief = await generateInboxBrief("user-1", "tenant-1");
    const cal = brief.items.find((it) => it.kind === "calendar");
    expect(cal).toBeTruthy();
    expect(cal!.title).toBe("Daily standup");
    expect(cal!.suggestedActions.some((a) => a.kind === "schedule")).toBe(true);
  });

  it("fail-soft : Gmail throw → marque source en erreur, autres sources continuent", async () => {
    mocks.getRecentEmails.mockRejectedValue(new Error("token expired"));
    mocks.getTodayEvents.mockResolvedValue([
      {
        id: "e1",
        title: "Standup",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        isAllDay: false,
      },
    ]);

    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(brief.sources).toContain("gmail:error");
    expect(brief.sources).toContain("calendar");
    expect(brief.items.some((it) => it.kind === "calendar")).toBe(true);
  });

  it("cap à 10 items max", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      subject: `Mail ${i}`,
      sender: "x@acme.com",
      snippet: "...",
      date: new Date(Date.now() - i * 1000).toISOString(),
      isRead: false,
    }));
    mocks.getRecentEmails.mockResolvedValue(many);

    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(brief.items.length).toBeLessThanOrEqual(10);
  });

  it("priorité urgent triée en premier (heuristique)", async () => {
    mocks.getRecentEmails.mockResolvedValue([
      {
        id: "m1",
        subject: "FYI",
        sender: "x@acme.com",
        snippet: "Pour info.",
        date: new Date().toISOString(),
        isRead: false,
      },
      {
        id: "m2",
        subject: "URGENT contrat",
        sender: "y@acme.com",
        snippet: "Bloqué deadline",
        date: new Date().toISOString(),
        isRead: false,
      },
    ]);

    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(brief.items[0].id).toBe("email:m2");
    expect(brief.items[0].priority).toBe("urgent");
  });

  it("Slack appelé seulement si Composio configuré", async () => {
    mocks.isComposioConfigured.mockReturnValue(false);
    await generateInboxBrief("user-1", "tenant-1");
    expect(mocks.executeComposioAction).not.toHaveBeenCalled();

    mocks.isComposioConfigured.mockReturnValue(true);
    mocks.executeComposioAction.mockResolvedValue({
      ok: true,
      data: {
        messages: [
          { channel: "general", text: "Hello", ts: String(Date.now() / 1000), user: "alice" },
        ],
      },
    });
    const brief = await generateInboxBrief("user-1", "tenant-1");
    expect(mocks.executeComposioAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SLACK_LIST_MESSAGES" }),
    );
    expect(brief.items.some((it) => it.kind === "slack")).toBe(true);
  });
});

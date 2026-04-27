/**
 * Write Action Guard tests — covers the preview-gate detection,
 * preview formatter, and domain → app filter.
 */

import { describe, it, expect } from "vitest";
import {
  isWriteAction,
  formatActionPreview,
  filterToolsByDomain,
} from "@/lib/connectors/composio/write-guard";
import type { DiscoveredTool } from "@/lib/connectors/composio/discovery";

function tool(name: string, app: string): DiscoveredTool {
  return { name, app, description: name, parameters: { type: "object", properties: {} } };
}

describe("isWriteAction", () => {
  it.each([
    ["GMAIL_SEND_EMAIL", true],
    ["SLACK_SEND_MESSAGE", true],
    ["NOTION_CREATE_PAGE", true],
    ["HUBSPOT_DELETE_CONTACT", true],
    ["GITHUB_UPDATE_FILE", true],
    ["GMAIL_REPLY_TO_EMAIL", true],
    ["SLACK_ARCHIVE_CHANNEL", true],
    ["GMAIL_LIST_MESSAGES", false],
    ["SLACK_GET_CHANNEL_INFO", false],
    ["GITHUB_GET_REPO", false],
    ["GMAIL_SEARCH_EMAILS", false],
    ["NOTION_GET_PAGE", false],
    ["HUBSPOT_LIST_CONTACTS", false],
  ])("%s → %s", (name, expected) => {
    expect(isWriteAction(name)).toBe(expected);
  });

  it("matches WRITE_PREFIXES on tools that start with a write verb (no leading underscore)", () => {
    expect(isWriteAction("SEND_EMAIL")).toBe(true);
    expect(isWriteAction("CREATE_TASK")).toBe(true);
    expect(isWriteAction("DELETE_RECORD")).toBe(true);
    expect(isWriteAction("UPDATE_PROFILE")).toBe(true);
  });

  it("non-standard names without underscores fall through to false", () => {
    // No prefix match (no trailing underscore) and no segment match
    expect(isWriteAction("send")).toBe(false);
    expect(isWriteAction("SEND")).toBe(false);
  });
});

describe("formatActionPreview", () => {
  it("includes the lowercased app name (uppercased in header)", () => {
    const out = formatActionPreview("SLACK_SEND_MESSAGE", { channel: "#dev", text: "hello" });
    expect(out).toContain("SLACK");
  });

  it("contains 'confirmer' in the footer", () => {
    const out = formatActionPreview("GMAIL_SEND_EMAIL", { to: "a@b.com", subject: "hi" });
    expect(out.toLowerCase()).toContain("confirmer");
  });

  it("surfaces prominent params (to, channel, subject)", () => {
    const out = formatActionPreview("GMAIL_SEND_EMAIL", {
      to: "marie@example.com",
      subject: "Hello world",
      body: "Lorem ipsum",
    });
    expect(out).toContain("marie@example.com");
    expect(out).toContain("Hello world");
    expect(out).toContain("to");
    expect(out).toContain("subject");
  });

  it("filters out _preview from the rendered preview", () => {
    const out = formatActionPreview("SLACK_SEND_MESSAGE", {
      channel: "#dev",
      text: "msg",
      _preview: true,
    });
    expect(out).not.toContain("_preview");
  });

  it("truncates long string values past 300 chars", () => {
    const longText = "x".repeat(500);
    const out = formatActionPreview("SLACK_SEND_MESSAGE", { channel: "#dev", text: longText });
    expect(out).not.toContain("x".repeat(500));
    expect(out).toContain("…");
  });

  it("returns a valid preview when args is empty", () => {
    const out = formatActionPreview("SLACK_SEND_MESSAGE", {});
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    expect(out.toLowerCase()).toContain("confirmer");
    expect(out).toContain("aucun paramètre");
  });
});

describe("filterToolsByDomain", () => {
  const allTools: DiscoveredTool[] = [
    tool("GMAIL_SEND_EMAIL", "gmail"),
    tool("SLACK_SEND_MESSAGE", "slack"),
    tool("GITHUB_CREATE_ISSUE", "github"),
    tool("JIRA_CREATE_ISSUE", "jira"),
    tool("LINEAR_CREATE_ISSUE", "linear"),
    tool("NOTION_CREATE_PAGE", "notion"),
    tool("STRIPE_CREATE_CHARGE", "stripe"),
    tool("FIGMA_GET_FILE", "figma"),
  ];

  it("communication → only gmail + slack", () => {
    const out = filterToolsByDomain(allTools, "communication");
    const apps = out.map((t) => t.app);
    expect(apps).toEqual(expect.arrayContaining(["gmail", "slack"]));
    expect(apps).not.toContain("github");
    expect(apps).not.toContain("notion");
    expect(apps).not.toContain("stripe");
    expect(apps).not.toContain("figma");
  });

  it("developer → only github, jira, linear", () => {
    const out = filterToolsByDomain(allTools, "developer");
    const apps = out.map((t) => t.app);
    expect(apps.sort()).toEqual(["github", "jira", "linear"]);
  });

  it("finance → only stripe", () => {
    const out = filterToolsByDomain(allTools, "finance");
    expect(out.map((t) => t.app)).toEqual(["stripe"]);
  });

  it("design → only figma", () => {
    const out = filterToolsByDomain(allTools, "design");
    expect(out.map((t) => t.app)).toEqual(["figma"]);
  });

  it("general → all tools (≤ 40)", () => {
    const out = filterToolsByDomain(allTools, "general");
    expect(out).toHaveLength(allTools.length);
  });

  it("research → all tools (≤ 40)", () => {
    const out = filterToolsByDomain(allTools, "research");
    expect(out).toHaveLength(allTools.length);
  });

  it("caps general domain at 40 tools", () => {
    const fifty = Array.from({ length: 50 }, (_, i) =>
      tool(`GENERIC_TOOL_${i}`, "gmail"),
    );
    const out = filterToolsByDomain(fifty, "general");
    expect(out).toHaveLength(40);
  });

  it("0 tools input → 0 tools output (no crash)", () => {
    expect(filterToolsByDomain([], "general")).toEqual([]);
    expect(filterToolsByDomain([], "communication")).toEqual([]);
  });

  it("unknown domain falls through to no-restriction (capped at 40)", () => {
    const out = filterToolsByDomain(allTools, "unknown_domain");
    expect(out).toHaveLength(allTools.length);
  });

  it("is case-insensitive on the tool app slug", () => {
    const mixed: DiscoveredTool[] = [
      tool("GMAIL_SEND_EMAIL", "Gmail"),
      tool("SLACK_SEND_MESSAGE", "SLACK"),
      tool("GITHUB_CREATE_ISSUE", "GitHub"),
    ];
    const out = filterToolsByDomain(mixed, "communication");
    const names = out.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE"]));
    expect(names).not.toContain("GITHUB_CREATE_ISSUE");
  });
});

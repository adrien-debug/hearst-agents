/**
 * Preview-mode tool calls don't fake-emit receipts.
 *
 * The ai-pipeline.ts skip logic prevents `tool_call_started` /
 * `tool_call_completed` events from firing when:
 *   1. The tool is an internal meta tool (request_connection / create_scheduled_mission)
 *   2. The tool is a write action with `_preview !== false`
 *
 * Mirror the gate logic here for unit-level coverage.
 */

import { describe, it, expect } from "vitest";
import { isWriteAction } from "@/lib/connectors/composio/write-guard";

const META_TOOLS = new Set(["request_connection", "create_scheduled_mission"]);

function shouldSkipChip(toolName: string, input: Record<string, unknown> | undefined): boolean {
  if (META_TOOLS.has(toolName)) return true;
  const args = input ?? {};
  return isWriteAction(toolName) && args._preview !== false;
}

describe("shouldSkipChip — internal meta tools", () => {
  it("skips request_connection regardless of args", () => {
    expect(shouldSkipChip("request_connection", { app: "slack" })).toBe(true);
    expect(shouldSkipChip("request_connection", undefined)).toBe(true);
  });

  it("skips create_scheduled_mission regardless of args", () => {
    expect(shouldSkipChip("create_scheduled_mission", { name: "x" })).toBe(true);
    expect(shouldSkipChip("create_scheduled_mission", undefined)).toBe(true);
  });

  it("does NOT skip a Composio read tool", () => {
    expect(shouldSkipChip("GMAIL_LIST_MESSAGES", {})).toBe(false);
    expect(shouldSkipChip("SLACK_GET_CHANNEL_INFO", { id: "C-1" })).toBe(false);
    expect(shouldSkipChip("GITHUB_GET_REPO", {})).toBe(false);
  });
});

describe("shouldSkipChip — write tools in preview mode", () => {
  it("skips when _preview is undefined (default true)", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { channel: "#dev", text: "x" })).toBe(true);
  });

  it("skips when _preview is true", () => {
    expect(shouldSkipChip("GMAIL_SEND_EMAIL", { to: "a@b", _preview: true })).toBe(true);
  });

  it("skips when args is undefined (treated as preview)", () => {
    expect(shouldSkipChip("HUBSPOT_CREATE_CONTACT", undefined)).toBe(true);
  });
});

describe("shouldSkipChip — write tools in execute mode", () => {
  it("does NOT skip when _preview: false", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { channel: "#dev", text: "x", _preview: false })).toBe(false);
  });

  it("does NOT skip GMAIL_SEND_EMAIL with _preview: false", () => {
    expect(shouldSkipChip("GMAIL_SEND_EMAIL", { to: "a@b", _preview: false })).toBe(false);
  });

  it("does NOT skip NOTION_CREATE_PAGE with _preview: false", () => {
    expect(shouldSkipChip("NOTION_CREATE_PAGE", { title: "x", _preview: false })).toBe(false);
  });

  it("does NOT skip GITHUB_DELETE_FILE with _preview: false", () => {
    expect(shouldSkipChip("GITHUB_DELETE_FILE", { path: "x.txt", _preview: false })).toBe(false);
  });
});

describe("shouldSkipChip — _preview only respected on write tools", () => {
  it("read tools always run regardless of _preview value", () => {
    expect(shouldSkipChip("GMAIL_LIST_MESSAGES", { _preview: true })).toBe(false);
    expect(shouldSkipChip("GMAIL_LIST_MESSAGES", { _preview: false })).toBe(false);
    expect(shouldSkipChip("SLACK_GET_CHANNEL_INFO", { _preview: true })).toBe(false);
  });
});

describe("shouldSkipChip — boundary string values for _preview", () => {
  it("_preview: 'false' (string) is NOT strictly false → still preview", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { _preview: "false" })).toBe(true);
  });

  it("_preview: 0 (truthy-ish) is NOT strictly false → still preview", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { _preview: 0 })).toBe(true);
  });

  it("_preview: null is NOT strictly false → still preview", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { _preview: null })).toBe(true);
  });

  it("only literal false bypasses the gate", () => {
    expect(shouldSkipChip("SLACK_SEND_MESSAGE", { _preview: false })).toBe(false);
  });
});

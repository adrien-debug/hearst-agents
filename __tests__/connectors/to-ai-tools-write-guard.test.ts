/**
 * Integration: write-guard preview gate inside toAiTools().
 *
 * Verifies that:
 *   - write tools intercept _preview !== false (returns draft, no Composio call)
 *   - write tools strip _preview before forwarding to executeComposioAction
 *   - read tools bypass the gate entirely
 *   - the injected JSON schema includes / excludes _preview correctly
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { executeComposioAction } = vi.hoisted(() => ({
  executeComposioAction: vi.fn(),
}));

vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction,
}));

import { toAiTools } from "@/lib/connectors/composio/to-ai-tools";
import type { DiscoveredTool } from "@/lib/connectors/composio/discovery";
import type { ToolExecutionOptions } from "ai";

const EXEC_OPTS = { toolCallId: "tc-1", messages: [] } as unknown as ToolExecutionOptions;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callExecute(tool: any, input: Record<string, unknown>): Promise<unknown> {
  const fn = tool.execute as (i: unknown, o: ToolExecutionOptions) => Promise<unknown>;
  return fn(input, EXEC_OPTS);
}

const writeTool: DiscoveredTool = {
  name: "SLACK_SEND_MESSAGE",
  description: "Send a Slack message",
  parameters: {
    type: "object",
    properties: {
      channel: { type: "string" },
      text: { type: "string" },
    },
    required: ["channel", "text"],
  },
  app: "slack",
};

const readTool: DiscoveredTool = {
  name: "GMAIL_LIST_MESSAGES",
  description: "List Gmail messages",
  parameters: { type: "object", properties: {} },
  app: "gmail",
};

describe("toAiTools — write-guard integration", () => {
  beforeEach(() => {
    executeComposioAction.mockReset();
    executeComposioAction.mockResolvedValue({ ok: true });
  });

  describe("write tool — preview mode (default)", () => {
    it("does NOT call executeComposioAction when _preview is undefined", async () => {
      const tools = toAiTools([writeTool], "user-1");
      const result = await callExecute(tools.SLACK_SEND_MESSAGE, {
        channel: "#dev",
        text: "hello",
      });
      expect(executeComposioAction).not.toHaveBeenCalled();
      expect(typeof result).toBe("string");
      // Le custom formatter Slack prend le relais → labels FR (Canal, Aperçu)
      expect(result as string).toContain("SLACK");
      expect((result as string).toLowerCase()).toContain("envoyer");
      expect(result as string).toContain("#dev");
      expect(result as string).toContain("hello");
      expect((result as string).toLowerCase()).toContain("confirmer");
    });

    it("does NOT call executeComposioAction when _preview is explicitly true", async () => {
      const tools = toAiTools([writeTool], "user-1");
      const result = await callExecute(tools.SLACK_SEND_MESSAGE, {
        channel: "#dev",
        text: "hello",
        _preview: true,
      });
      expect(executeComposioAction).not.toHaveBeenCalled();
      expect(result as string).toContain("SLACK");
    });
  });

  describe("write tool — confirmed execution", () => {
    it("calls executeComposioAction with stripped params when _preview: false", async () => {
      const tools = toAiTools([writeTool], "user-marie");
      await callExecute(tools.SLACK_SEND_MESSAGE, {
        channel: "#dev",
        text: "hello",
        _preview: false,
      });

      expect(executeComposioAction).toHaveBeenCalledTimes(1);
      const call = executeComposioAction.mock.calls[0][0];
      expect(call.action).toBe("SLACK_SEND_MESSAGE");
      expect(call.entityId).toBe("user-marie");
      expect(call.params).toEqual({ channel: "#dev", text: "hello" });
      expect(call.params).not.toHaveProperty("_preview");
    });
  });

  describe("read tool — bypass", () => {
    it("calls executeComposioAction directly even with _preview present (gate ignored)", async () => {
      const tools = toAiTools([readTool], "user-1");
      await callExecute(tools.GMAIL_LIST_MESSAGES, {
        _preview: true,
        query: "label:inbox",
      });
      expect(executeComposioAction).toHaveBeenCalledTimes(1);
      const call = executeComposioAction.mock.calls[0][0];
      expect(call.action).toBe("GMAIL_LIST_MESSAGES");
      // Read tools forward args unchanged — no preview-strip logic.
      expect(call.params).toEqual({ _preview: true, query: "label:inbox" });
    });

    it("calls executeComposioAction directly when no _preview is given", async () => {
      const tools = toAiTools([readTool], "user-1");
      await callExecute(tools.GMAIL_LIST_MESSAGES, {});
      expect(executeComposioAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("schema injection", () => {
    it("write tool schema contains _preview as an optional boolean", () => {
      const tools = toAiTools([writeTool], "user-1");
      // Vercel AI SDK normalizes the schema; we read jsonSchema property
      const schema = tools.SLACK_SEND_MESSAGE.inputSchema as unknown as {
        jsonSchema: { properties: Record<string, unknown> };
      };
      const props = schema.jsonSchema.properties;
      expect(props).toHaveProperty("_preview");
      expect(props).toHaveProperty("channel");
      expect(props).toHaveProperty("text");
      expect(props._preview).toMatchObject({ type: "boolean", default: true });
    });

    it("read tool schema does NOT contain _preview", () => {
      const tools = toAiTools([readTool], "user-1");
      const schema = tools.GMAIL_LIST_MESSAGES.inputSchema as unknown as {
        jsonSchema: { properties?: Record<string, unknown> };
      };
      const props = schema.jsonSchema.properties ?? {};
      expect(props).not.toHaveProperty("_preview");
    });
  });
});

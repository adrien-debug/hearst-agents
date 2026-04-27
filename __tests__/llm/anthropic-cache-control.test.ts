import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { messagesCreate, stream } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: messagesCreate, stream };
  }
  return { default: Anthropic };
});

import { AnthropicProvider } from "@/lib/llm/anthropic";

function fakeAnthropicResponse(over: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 12,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    ...over,
  };
}

describe("AnthropicProvider — cache_control plumbing", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    messagesCreate.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("sends system as a plain string when no cache_control is set", async () => {
    messagesCreate.mockResolvedValueOnce(fakeAnthropicResponse());
    const p = new AnthropicProvider();
    await p.chat({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "you are a bot" },
        { role: "user", content: "hi" },
      ],
    });
    const params = messagesCreate.mock.calls[0][0];
    expect(params.system).toBe("you are a bot");
  });

  it("converts system to a cacheable content block when cache_control is set", async () => {
    messagesCreate.mockResolvedValueOnce(fakeAnthropicResponse());
    const p = new AnthropicProvider();
    await p.chat({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "big system prompt", cache_control: { type: "ephemeral" } },
        { role: "user", content: "hi" },
      ],
    });
    const params = messagesCreate.mock.calls[0][0];
    expect(params.system).toEqual([
      { type: "text", text: "big system prompt", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("converts user/assistant messages to cacheable content blocks when cache_control is set", async () => {
    messagesCreate.mockResolvedValueOnce(fakeAnthropicResponse());
    const p = new AnthropicProvider();
    await p.chat({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "long context", cache_control: { type: "ephemeral" } },
        { role: "user", content: "what now?" },
      ],
    });
    const params = messagesCreate.mock.calls[0][0];
    expect(params.messages[0].content).toEqual([
      { type: "text", text: "long context", cache_control: { type: "ephemeral" } },
    ]);
    expect(params.messages[1].content).toBe("what now?");
  });

  it("surfaces cache_creation/read tokens on ChatResponse", async () => {
    messagesCreate.mockResolvedValueOnce(
      fakeAnthropicResponse({
        usage: {
          input_tokens: 10,
          output_tokens: 3,
          cache_creation_input_tokens: 1500,
          cache_read_input_tokens: 0,
        },
      }),
    );
    const p = new AnthropicProvider();
    const res = await p.chat({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.cache_creation_tokens).toBe(1500);
    expect(res.cache_read_tokens).toBeUndefined();
  });

  it("reports a cache hit when cache_read_input_tokens > 0", async () => {
    messagesCreate.mockResolvedValueOnce(
      fakeAnthropicResponse({
        usage: {
          input_tokens: 8,
          output_tokens: 2,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1500,
        },
      }),
    );
    const p = new AnthropicProvider();
    const res = await p.chat({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.cache_read_tokens).toBe(1500);
    expect(res.cache_creation_tokens).toBeUndefined();
  });
});

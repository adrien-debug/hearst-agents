/**
 * mintRealtimeSession — verrouille que les tools sont bien envoyés à
 * OpenAI Realtime au mint, et que le format matche l'API expected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mintRealtimeSession } from "@/lib/capabilities/providers/openai-realtime";
import { voiceToolDefs } from "@/lib/voice/tool-defs";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test-fake");
  fetchMock.mockReset().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "sess-1",
        client_secret: { value: "ek-fake", expires_at: Date.now() + 60_000 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mintRealtimeSession", () => {
  it("envoie les tools dans le body quand fournis", async () => {
    await mintRealtimeSession({ tools: voiceToolDefs });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.model).toBe("gpt-4o-realtime-preview");
    expect(body.modalities).toEqual(["audio", "text"]);
    expect(body.tools).toHaveLength(3);
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual([
      "start_meeting_bot",
      "start_simulation",
      "generate_image",
    ]);
    expect(body.tool_choice).toBe("auto");
  });

  it("n'envoie pas de tools quand l'array est vide ou absent", async () => {
    await mintRealtimeSession();

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("propage la sessionId et l'ephemeralKey du retour OpenAI", async () => {
    const result = await mintRealtimeSession({ tools: voiceToolDefs });
    expect(result.sessionId).toBe("sess-1");
    expect(result.ephemeralKey).toBe("ek-fake");
  });

  it("throw quand OpenAI répond non-OK", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "auth" } }), { status: 401 }),
    );
    await expect(mintRealtimeSession()).rejects.toThrow(/mint failed 401/);
  });
});

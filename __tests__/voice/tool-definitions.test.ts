/**
 * Voice tool definitions — vérifie le merge Composio + Hearst natifs avec
 * cache TTL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getVoiceComposioToolsMock } = vi.hoisted(() => ({
  getVoiceComposioToolsMock: vi.fn(),
}));

vi.mock("@/lib/voice/composio-bridge", () => ({
  getVoiceComposioTools: getVoiceComposioToolsMock,
  isComposioToolName: (n: string) => /^[A-Z][A-Z0-9_]+$/.test(n),
}));

import { buildVoiceTools, clearVoiceToolsCache } from "@/lib/voice/tool-definitions";
import { voiceToolDefs } from "@/lib/voice/tool-defs";

beforeEach(() => {
  getVoiceComposioToolsMock.mockReset();
  clearVoiceToolsCache();
});

describe("buildVoiceTools", () => {
  it("merge Hearst natifs + Composio tools, Hearst en premier", async () => {
    getVoiceComposioToolsMock.mockResolvedValue([
      {
        type: "function",
        name: "GMAIL_SEND_EMAIL",
        description: "Send an email",
        parameters: { type: "object", properties: {} },
      },
    ]);

    const tools = await buildVoiceTools("user-1");

    expect(tools.length).toBe(voiceToolDefs.length + 1);
    expect(tools.slice(0, voiceToolDefs.length).map((t) => t.name)).toEqual(
      voiceToolDefs.map((t) => t.name),
    );
    expect(tools[voiceToolDefs.length].name).toBe("GMAIL_SEND_EMAIL");
  });

  it("Composio vide → renvoie uniquement les Hearst natifs", async () => {
    getVoiceComposioToolsMock.mockResolvedValue([]);
    const tools = await buildVoiceTools("user-2");
    expect(tools.length).toBe(voiceToolDefs.length);
  });

  it("cache TTL : 2 appels rapprochés → 1 seul fetch Composio", async () => {
    getVoiceComposioToolsMock.mockResolvedValue([]);
    await buildVoiceTools("user-cache");
    await buildVoiceTools("user-cache");
    expect(getVoiceComposioToolsMock).toHaveBeenCalledTimes(1);
  });

  it("clearVoiceToolsCache invalide bien le cache", async () => {
    getVoiceComposioToolsMock.mockResolvedValue([]);
    await buildVoiceTools("user-cache-2");
    clearVoiceToolsCache();
    await buildVoiceTools("user-cache-2");
    expect(getVoiceComposioToolsMock).toHaveBeenCalledTimes(2);
  });
});

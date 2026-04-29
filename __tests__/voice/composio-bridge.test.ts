/**
 * Composio bridge — verrouille la curation et le format de conversion.
 *
 * Pour la voix : pas plus de 4 tools par toolkit, pas plus de 20 total,
 * format plat OpenAI Realtime (`{ type, name, description, parameters }`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getToolsForUserMock } = vi.hoisted(() => ({
  getToolsForUserMock: vi.fn(),
}));

vi.mock("@/lib/connectors/composio/discovery", () => ({
  getToolsForUser: getToolsForUserMock,
}));

import { getVoiceComposioTools, isComposioToolName } from "@/lib/voice/composio-bridge";

beforeEach(() => {
  getToolsForUserMock.mockReset();
});

describe("isComposioToolName", () => {
  it("matche les slugs Composio (UPPERCASE_SNAKE)", () => {
    expect(isComposioToolName("GMAIL_SEND_EMAIL")).toBe(true);
    expect(isComposioToolName("SLACK_SEND_MESSAGE")).toBe(true);
    expect(isComposioToolName("GOOGLECALENDAR_CREATE_EVENT")).toBe(true);
  });

  it("ne matche pas les hearst tools (lowercase)", () => {
    expect(isComposioToolName("start_meeting_bot")).toBe(false);
    expect(isComposioToolName("start_simulation")).toBe(false);
    expect(isComposioToolName("generate_image")).toBe(false);
  });

  it("ne matche pas les chaînes vides ou random", () => {
    expect(isComposioToolName("")).toBe(false);
    expect(isComposioToolName("Mixed_Case")).toBe(false);
  });
});

describe("getVoiceComposioTools", () => {
  it("retourne array vide si userId vide", async () => {
    const tools = await getVoiceComposioTools("");
    expect(tools).toEqual([]);
    expect(getToolsForUserMock).not.toHaveBeenCalled();
  });

  it("retourne array vide si discovery throw", async () => {
    getToolsForUserMock.mockRejectedValue(new Error("network"));
    const tools = await getVoiceComposioTools("user-1");
    expect(tools).toEqual([]);
  });

  it("convertit DiscoveredTool → VoiceToolDef au format plat Realtime", async () => {
    getToolsForUserMock.mockResolvedValue([
      {
        name: "GMAIL_SEND_EMAIL",
        description: "Envoie un email",
        parameters: {
          type: "object",
          required: ["to", "subject"],
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
          },
        },
        app: "gmail",
      },
    ]);

    const tools = await getVoiceComposioTools("user-1");
    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({
      type: "function",
      name: "GMAIL_SEND_EMAIL",
      description: "Envoie un email",
      parameters: {
        type: "object",
        required: ["to", "subject"],
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
        },
      },
    });
  });

  it("cap à 4 tools par toolkit", async () => {
    const gmailTools = Array.from({ length: 8 }, (_, i) => ({
      name: `GMAIL_ACTION_${i}`,
      description: `Action ${i}`,
      parameters: { type: "object", properties: {} },
      app: "gmail",
    }));
    getToolsForUserMock.mockResolvedValue(gmailTools);

    const tools = await getVoiceComposioTools("user-1");
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "GMAIL_ACTION_0",
      "GMAIL_ACTION_1",
      "GMAIL_ACTION_2",
      "GMAIL_ACTION_3",
    ]);
  });

  it("cap à 20 tools total quand plusieurs toolkits", async () => {
    const apps = ["gmail", "slack", "linear", "notion", "googlecalendar", "googledrive"];
    const tools = apps.flatMap((app) =>
      Array.from({ length: 5 }, (_, i) => ({
        name: `${app.toUpperCase()}_ACTION_${i}`,
        description: `${app} ${i}`,
        parameters: { type: "object", properties: {} },
        app,
      })),
    );
    getToolsForUserMock.mockResolvedValue(tools);

    const result = await getVoiceComposioTools("user-1");
    // 6 apps × 4 max = 24 candidats, cappés à 20
    expect(result).toHaveLength(20);
  });

  it("dégrade gracieusement quand parameters est absent", async () => {
    getToolsForUserMock.mockResolvedValue([
      {
        name: "WEIRD_TOOL_NO_PARAMS",
        description: "",
        parameters: null as unknown as Record<string, unknown>,
        app: "weird",
      },
    ]);

    const tools = await getVoiceComposioTools("user-1");
    expect(tools[0].parameters).toEqual({ type: "object", properties: {} });
    expect(tools[0].description).toBe("WEIRD_TOOL_NO_PARAMS");
  });
});

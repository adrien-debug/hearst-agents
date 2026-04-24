import { describe, expect, it } from "vitest";
import { buildConnectionId, parseConnectionId } from "@/lib/connectors/nango/proxy";

describe("nango connectionId encoding", () => {
  it("preserves a canonical email lossless across build → parse round-trip", () => {
    const userId = "adrien.hearst@corpo.com";
    const provider = "slack";

    const cid = buildConnectionId(userId, provider);
    const parsed = parseConnectionId(cid);

    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe(userId);
    expect(parsed?.provider).toBe(provider);
  });

  it("preserves emails with uppercase, plus-tags and unicode", () => {
    const userId = "Léa+work@hèarst.io";
    const provider = "gmail";

    const cid = buildConnectionId(userId, provider);
    const parsed = parseConnectionId(cid);

    expect(parsed?.userId).toBe(userId);
    expect(parsed?.provider).toBe(provider);
  });

  it("uses the canonical hex prefix and url-safe charset", () => {
    const cid = buildConnectionId("adrien.hearst@corpo.com", "slack");
    expect(cid.startsWith("hearstx-")).toBe(true);
    expect(/^hearstx-[a-f0-9]+-[a-z0-9-]+$/.test(cid)).toBe(true);
  });

  it("falls back to the legacy hearst- format for backward compatibility", () => {
    // Pre-fix format: userId was normalized + truncated to 20 alphanumeric chars
    const legacy = "hearst-adrienhearstcorpo-slack";
    const parsed = parseConnectionId(legacy);

    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe("adrienhearstcorpo");
    expect(parsed?.provider).toBe("slack");
  });

  it("returns null for connectionIds that match no known format", () => {
    expect(parseConnectionId("not_a_connection")).toBeNull();
    expect(parseConnectionId("foo-bar-baz")).toBeNull();
    expect(parseConnectionId("")).toBeNull();
  });
});

/**
 * Tests des helpers purs de lib/tools/native/meetings.ts
 * (parseMeetingContent + normalize). Pas d'I/O.
 */

import { describe, expect, it } from "vitest";
import { parseMeetingContent, normalize } from "@/lib/tools/native/meetings";
import type { Asset } from "@/lib/assets/types";

function makeAsset(contentRef: string | undefined): Asset {
  return {
    id: "asset_1",
    threadId: "thread_1",
    kind: "event",
    title: "Meeting test",
    createdAt: 1730000000000,
    provenance: { providerId: "system" },
    contentRef,
  };
}

describe("parseMeetingContent", () => {
  it("retourne null si contentRef absent", () => {
    expect(parseMeetingContent(makeAsset(undefined))).toBeNull();
  });

  it("retourne null si contentRef invalide JSON", () => {
    expect(parseMeetingContent(makeAsset("not json"))).toBeNull();
    expect(parseMeetingContent(makeAsset("{ broken"))).toBeNull();
  });

  it("parse un contentRef valide", () => {
    const payload = {
      transcript: "Adrien : ...",
      actionItems: [{ action: "Relancer Marc", owner: "Adrien" }],
      editorialSummary: "## Contexte\n…",
      startedAt: 1730000000000,
      endedAt: 1730003600000,
      status: "done",
    };
    const result = parseMeetingContent(makeAsset(JSON.stringify(payload)));
    expect(result).not.toBeNull();
    expect(result!.transcript).toBe("Adrien : ...");
    expect(result!.actionItems).toHaveLength(1);
    expect(result!.editorialSummary).toContain("Contexte");
  });

  it("accepte un contentRef partiel", () => {
    // Pas tous les champs requis — juste transcript par exemple
    const result = parseMeetingContent(makeAsset(JSON.stringify({ transcript: "test" })));
    expect(result).not.toBeNull();
    expect(result!.transcript).toBe("test");
    expect(result!.actionItems).toBeUndefined();
  });
});

describe("meetings normalize", () => {
  it("comportement identique au normalize de missions", () => {
    expect(normalize("  Sequoia Term Sheet  ")).toBe("sequoia term sheet");
    expect(normalize("RÉUNION CRITIQUE")).toBe("reunion critique");
  });
});

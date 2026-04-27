/**
 * Thread-name truncation logic — extracted from app/(user)/page.tsx.
 *
 * Rule: keep names short but never cut a word in half if a space exists
 * past position 15. Otherwise hard-cut at 40 chars.
 */

import { describe, it, expect } from "vitest";

function truncateThreadName(message: string): string {
  const raw = message.slice(0, 50);
  return message.length > 40
    ? raw.lastIndexOf(" ") > 15
      ? raw.slice(0, raw.lastIndexOf(" "))
      : raw.slice(0, 40)
    : message;
}

describe("truncateThreadName", () => {
  it("returns the message unchanged when ≤ 40 chars", () => {
    expect(truncateThreadName("Bonjour")).toBe("Bonjour");
  });

  it("returns 'Résume mes emails du jour' (25 chars) unchanged", () => {
    const m = "Résume mes emails du jour";
    expect(m.length).toBe(25);
    expect(truncateThreadName(m)).toBe(m);
  });

  it("truncates at the last space before char 50 for a 49-char message past 40", () => {
    // 49 chars total — passes the >40 threshold
    const m = "Envoie un message à toute l'équipe de direction";
    expect(m.length).toBeGreaterThan(40);
    const out = truncateThreadName(m);
    // Should not end in mid-word — the last char must be a non-space and the
    // result must be a prefix of the input.
    expect(m.startsWith(out)).toBe(true);
    expect(out.endsWith(" ")).toBe(false);
    // The chunk after `out` must start with a space (proving we cut at one)
    const remainder = m.slice(out.length);
    expect(remainder.startsWith(" ")).toBe(true);
  });

  it("hard-cuts at 40 when the 50-char window has no space past index 15", () => {
    // 41 chars, no spaces at all → triggers the inner-else branch.
    const m = "x".repeat(41);
    const out = truncateThreadName(m);
    expect(out).toHaveLength(40);
    expect(out).toBe("x".repeat(40));
  });

  it("60-char message with a space at position 30 cuts at that space", () => {
    // 30 'a's, one space, 29 'b's = 60 chars total
    const m = "a".repeat(30) + " " + "b".repeat(29);
    expect(m.length).toBe(60);
    const out = truncateThreadName(m);
    expect(out).toBe("a".repeat(30));
  });

  it("60-char message with first space at position 5 (< 15) hard-cuts at 40", () => {
    // "abcde " + 54 'x's
    const m = "abcde " + "x".repeat(54);
    expect(m.length).toBe(60);
    const out = truncateThreadName(m);
    // The 50-char window is "abcde " + "x".repeat(44). lastIndexOf(" ") = 5,
    // not > 15 → hard-cut at 40.
    expect(out).toHaveLength(40);
    expect(out).toBe("abcde " + "x".repeat(34));
  });

  it("empty string returns empty string", () => {
    expect(truncateThreadName("")).toBe("");
  });
});

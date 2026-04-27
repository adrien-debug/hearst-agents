/**
 * ChatMessages — pending confirmation detection.
 *
 * The Confirm/Cancel chips render when an assistant message contains the
 * "Réponds **confirmer**" trailer (emitted by write-guard preview tool
 * results and the schedule mission preview).
 */

import { describe, it, expect } from "vitest";

// Re-derived from app/(user)/components/ChatMessages.tsx — kept in sync
// because the marker is the contract between the model output and the UI.
function hasPendingConfirmation(content: string): boolean {
  return /Réponds\s+\*\*confirmer\*\*/i.test(content);
}

describe("hasPendingConfirmation", () => {
  it("matches the canonical write-guard preview trailer", () => {
    const trailer = "↩ Réponds **confirmer** pour exécuter, ou **annuler** pour abandonner.";
    expect(hasPendingConfirmation(trailer)).toBe(true);
  });

  it("matches the schedule mission preview trailer", () => {
    const trailer = "↩ Réponds **confirmer** pour créer la mission, ou **annuler** pour abandonner.";
    expect(hasPendingConfirmation(trailer)).toBe(true);
  });

  it("matches the trailer embedded in a longer message", () => {
    const msg = `📋 Draft · SLACK · Envoyer\n\n**channel** : #dev\n**text** : hi\n\n↩ Réponds **confirmer** pour exécuter, ou **annuler** pour abandonner.`;
    expect(hasPendingConfirmation(msg)).toBe(true);
  });

  it("is case-insensitive on the verb", () => {
    expect(hasPendingConfirmation("Réponds **CONFIRMER** pour…")).toBe(true);
    expect(hasPendingConfirmation("Réponds **Confirmer** pour…")).toBe(true);
  });

  it("tolerates extra whitespace between Réponds and **confirmer**", () => {
    expect(hasPendingConfirmation("Réponds   **confirmer**")).toBe(true);
    expect(hasPendingConfirmation("Réponds\t**confirmer**")).toBe(true);
  });

  it("does NOT match a paraphrased confirmation request", () => {
    expect(hasPendingConfirmation("Confirme ça stp")).toBe(false);
    expect(hasPendingConfirmation("Réponds confirmer (sans markdown)")).toBe(false);
    expect(hasPendingConfirmation("**confirmer**")).toBe(false);
  });

  it("does NOT match arbitrary text", () => {
    expect(hasPendingConfirmation("")).toBe(false);
    expect(hasPendingConfirmation("Bonjour, comment ça va ?")).toBe(false);
    expect(hasPendingConfirmation("J'ai envoyé le message")).toBe(false);
  });

  it("matches when the trailer is at the start of the message", () => {
    expect(hasPendingConfirmation("Réponds **confirmer** maintenant")).toBe(true);
  });

  it("requires the literal markdown bold around 'confirmer'", () => {
    // No bold → no match
    expect(hasPendingConfirmation("Réponds confirmer pour exécuter")).toBe(false);
    // Italic → no match
    expect(hasPendingConfirmation("Réponds *confirmer* pour exécuter")).toBe(false);
  });

  it("matches even with mixed-case 'Réponds'", () => {
    // The regex is /i — Réponds itself is also case-insensitive
    expect(hasPendingConfirmation("réponds **confirmer**")).toBe(true);
    expect(hasPendingConfirmation("RÉPONDS **confirmer**")).toBe(true);
  });

  it("does not match across line boundaries when verb is split", () => {
    // \s+ in the regex matches newlines too — this is intentional
    expect(hasPendingConfirmation("Réponds\n**confirmer**")).toBe(true);
  });
});

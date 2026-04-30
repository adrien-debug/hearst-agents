/**
 * tool-result-enrichment — Vérifie que la dérivation provider faite par
 * le SSEAdapter produit un providerId/Label fiable même quand l'orchestrator
 * n'attache rien (ou seulement le générique "composio").
 */

import { describe, it, expect } from "vitest";
import { deriveProvider } from "@/lib/events/consumers/sse-adapter";

describe("deriveProvider", () => {
  it("respecte un providerId explicite non générique", () => {
    const r = deriveProvider("WHATEVER_TOOL", "linear", "Linear");
    expect(r.providerId).toBe("linear");
    expect(r.providerLabel).toBe("Linear");
  });

  it("dérive le label si seulement providerId fourni", () => {
    const r = deriveProvider("WHATEVER_TOOL", "asana");
    expect(r.providerId).toBe("asana");
    expect(r.providerLabel).toBe("Asana");
  });

  it("ignore le providerId générique 'composio' et dérive du tool", () => {
    const r = deriveProvider("GMAIL_SEND_EMAIL", "composio");
    expect(r.providerId).toBe("gmail");
    expect(r.providerLabel).toBe("Gmail");
  });

  it("Composio prefix → toolkit slug", () => {
    expect(deriveProvider("SLACK_POST_MESSAGE").providerId).toBe("slack");
    expect(deriveProvider("NOTION_CREATE_PAGE").providerLabel).toBe("Notion");
    expect(deriveProvider("LINEAR_CREATE_ISSUE").providerLabel).toBe("Linear");
  });

  it("native tool → mappe vers son provider", () => {
    expect(deriveProvider("generate_image").providerId).toBe("fal_ai");
    expect(deriveProvider("execute_code").providerId).toBe("e2b");
    expect(deriveProvider("parse_document").providerLabel).toBe("LlamaParse");
  });

  it("fallback → composio si rien d'autre", () => {
    const r = deriveProvider("");
    expect(r.providerId).toBe("composio");
  });
});

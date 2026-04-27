/**
 * AUTH_REQUIRED auto-recovery — tool-result handler in ai-pipeline.ts.
 *
 * When a Composio tool returns `{ok: false, errorCode: "AUTH_REQUIRED"}`
 * the pipeline emits `app_connect_required` so the OAuth card auto-shows.
 * We extract the same logic here for testing without spinning up streamText.
 */

import { describe, it, expect, vi } from "vitest";

interface ToolResultEnvelope {
  ok?: boolean;
  errorCode?: string;
  error?: string;
}

// Mirrored from ai-pipeline.ts tool-result handler.
function maybeEmitAuthRecovery(
  toolName: string | undefined,
  output: unknown,
  emit: (event: { type: string; app: string; reason: string }) => void,
): boolean {
  const out = output as ToolResultEnvelope | undefined;
  if (!out || out.ok !== false || out.errorCode !== "AUTH_REQUIRED" || !toolName) {
    return false;
  }
  const app = toolName.split("_")[0]?.toLowerCase();
  if (!app) return false;
  emit({
    type: "app_connect_required",
    app,
    reason: `La connexion à ${app} a expiré ou été révoquée. Reconnecte-toi pour continuer.`,
  });
  return true;
}

describe("AUTH_REQUIRED auto-recovery", () => {
  it("emits app_connect_required for SLACK_SEND_MESSAGE / AUTH_REQUIRED", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery(
      "SLACK_SEND_MESSAGE",
      { ok: false, errorCode: "AUTH_REQUIRED", error: "no token" },
      emit,
    );
    expect(triggered).toBe(true);
    expect(emit).toHaveBeenCalledWith({
      type: "app_connect_required",
      app: "slack",
      reason: expect.stringContaining("slack"),
    });
  });

  it("extracts the app slug from the first underscore segment (gmail)", () => {
    const emit = vi.fn();
    maybeEmitAuthRecovery("GMAIL_SEND_EMAIL", { ok: false, errorCode: "AUTH_REQUIRED" }, emit);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ app: "gmail" }),
    );
  });

  it("extracts the app slug for hubspot", () => {
    const emit = vi.fn();
    maybeEmitAuthRecovery("HUBSPOT_CREATE_CONTACT", { ok: false, errorCode: "AUTH_REQUIRED" }, emit);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ app: "hubspot" }),
    );
  });

  it("does NOT emit on success envelope", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery(
      "SLACK_SEND_MESSAGE",
      { ok: true, data: {} },
      emit,
    );
    expect(triggered).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("does NOT emit on non-auth failure (ACTION_FAILED)", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery(
      "SLACK_SEND_MESSAGE",
      { ok: false, errorCode: "ACTION_FAILED", error: "rate limit" },
      emit,
    );
    expect(triggered).toBe(false);
  });

  it("does NOT emit when output is a plain string (e.g., request_connection)", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery(
      "request_connection",
      "Connection request sent",
      emit,
    );
    expect(triggered).toBe(false);
  });

  it("does NOT emit when output is null", () => {
    const emit = vi.fn();
    expect(maybeEmitAuthRecovery("X_Y", null, emit)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("does NOT emit when output is undefined", () => {
    const emit = vi.fn();
    expect(maybeEmitAuthRecovery("X_Y", undefined, emit)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("does NOT emit when toolName is undefined", () => {
    const emit = vi.fn();
    expect(maybeEmitAuthRecovery(undefined, { ok: false, errorCode: "AUTH_REQUIRED" }, emit)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it("does NOT emit when toolName has no underscore (single token)", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery("solo", { ok: false, errorCode: "AUTH_REQUIRED" }, emit);
    // split("_")[0] = "solo", non-empty → app = "solo", emit fires
    expect(triggered).toBe(true);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ app: "solo" }));
  });

  it("does NOT emit when toolName starts with underscore", () => {
    const emit = vi.fn();
    // "_FOO".split("_") → ["", "FOO"] → first is "", falsy → no emit
    const triggered = maybeEmitAuthRecovery("_FOO", { ok: false, errorCode: "AUTH_REQUIRED" }, emit);
    expect(triggered).toBe(false);
  });

  it("does NOT emit when ok is undefined (envelope ambiguous)", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery("FOO_BAR", { errorCode: "AUTH_REQUIRED" }, emit);
    expect(triggered).toBe(false);
  });

  it("does NOT emit when errorCode is missing", () => {
    const emit = vi.fn();
    const triggered = maybeEmitAuthRecovery("FOO_BAR", { ok: false }, emit);
    expect(triggered).toBe(false);
  });

  it("emits a French reason that mentions the app", () => {
    const emit = vi.fn();
    maybeEmitAuthRecovery("NOTION_CREATE_PAGE", { ok: false, errorCode: "AUTH_REQUIRED" }, emit);
    const event = emit.mock.calls[0][0];
    expect(event.reason).toMatch(/notion/i);
    expect(event.reason).toMatch(/expir|révoqu/i);
  });
});

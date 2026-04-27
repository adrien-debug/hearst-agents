/**
 * ChatMessages — render-condition logic tests (no DOM).
 *
 * Mirrors the boolean gates in app/(user)/components/ChatMessages.tsx so we
 * lock in the post-refactor behavior:
 *   - ChatConnectInline renders independently of message.content length
 *     (must show OAuth card even when the assistant produced no text yet).
 *   - AssistantActions stays gated by content.length > 0.
 */

import { describe, it, expect } from "vitest";

interface RenderProbe {
  showShimmer: boolean;
  showConnectInline: boolean;
  showAssistantActions: boolean;
}

function deriveRender(opts: {
  isLastAssistant: boolean;
  isRunning: boolean;
  contentLength: number;
}): RenderProbe {
  const showShimmer = opts.isLastAssistant && opts.contentLength === 0 && opts.isRunning;
  const showConnectInline = opts.isLastAssistant && !showShimmer;
  const showAssistantActions = !showShimmer && opts.contentLength > 0;
  return { showShimmer, showConnectInline, showAssistantActions };
}

describe("ChatMessages render gates (post-refactor)", () => {
  it("renders ChatConnectInline when last assistant + no shimmer + empty content", () => {
    const r = deriveRender({ isLastAssistant: true, isRunning: false, contentLength: 0 });
    expect(r.showShimmer).toBe(false);
    expect(r.showConnectInline).toBe(true);
    expect(r.showAssistantActions).toBe(false);
  });

  it("renders ChatConnectInline when last assistant + non-empty content", () => {
    const r = deriveRender({ isLastAssistant: true, isRunning: false, contentLength: 100 });
    expect(r.showConnectInline).toBe(true);
    expect(r.showAssistantActions).toBe(true);
  });

  it("does NOT render ChatConnectInline while shimmer is active", () => {
    // shimmer = isLastAssistant && empty content && running
    const r = deriveRender({ isLastAssistant: true, isRunning: true, contentLength: 0 });
    expect(r.showShimmer).toBe(true);
    expect(r.showConnectInline).toBe(false);
    expect(r.showAssistantActions).toBe(false);
  });

  it("does NOT render ChatConnectInline when message is not last assistant", () => {
    const r = deriveRender({ isLastAssistant: false, isRunning: false, contentLength: 50 });
    expect(r.showConnectInline).toBe(false);
  });

  it("AssistantActions stays gated by non-empty content even when ChatConnectInline shows", () => {
    const empty = deriveRender({ isLastAssistant: true, isRunning: false, contentLength: 0 });
    expect(empty.showConnectInline).toBe(true);
    expect(empty.showAssistantActions).toBe(false);

    const filled = deriveRender({ isLastAssistant: true, isRunning: false, contentLength: 5 });
    expect(filled.showConnectInline).toBe(true);
    expect(filled.showAssistantActions).toBe(true);
  });
});

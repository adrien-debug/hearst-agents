import { describe, it, expect } from "vitest";
import { consumeOrchestrateSseResponse } from "@/lib/engine/orchestrator/consume-sse-response";

describe("consumeOrchestrateSseResponse", () => {
  it("returns ok false on HTTP error", async () => {
    const res = new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401 });
    const out = await consumeOrchestrateSseResponse(res);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("not_authenticated");
  });

  it("returns ok false when stream contains run_failed", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"run_failed","error":"boom"}\n\n'));
        controller.close();
      },
    });
    const res = new Response(body, { status: 200 });
    const out = await consumeOrchestrateSseResponse(res);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("boom");
  });

  it("returns ok true when stream completes without run_failed", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"run_completed"}\n\n'));
        controller.close();
      },
    });
    const res = new Response(body, { status: 200 });
    const out = await consumeOrchestrateSseResponse(res);
    expect(out.ok).toBe(true);
  });
});

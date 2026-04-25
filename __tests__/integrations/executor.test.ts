import { describe, it, expect } from "vitest";
import { executeIntegration } from "@/lib/integrations/executor";
import { RuntimeError } from "@/lib/engine/runtime/lifecycle";
import { RunTracer } from "@/lib/engine/runtime/tracer";
import { createMockSupabase } from "../runtime/mock-supabase";

function makeSb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createMockSupabase() as any;
}

function seedConnection(sb: ReturnType<typeof makeSb>, overrides: Record<string, unknown> = {}) {
  const connection = {
    id: "conn-test-1",
    provider: "http",
    name: "Test HTTP",
    auth_type: "none",
    credentials: {},
    scopes: [],
    status: "active",
    health: "unknown",
    last_health_check: null,
    config: {},
    ...overrides,
  };
  sb.from("integration_connections").insert(connection);
  return connection;
}

describe("executeIntegration", () => {
  it("throws on missing connection", async () => {
    const sb = makeSb();

    await expect(
      executeIntegration(sb, {
        connection_id: "nonexistent",
        action: "http.fetch",
        input: { url: "https://example.com" },
      }),
    ).rejects.toThrow(RuntimeError);
  });

  it("throws on inactive connection", async () => {
    const sb = makeSb();
    seedConnection(sb, { status: "revoked" });

    await expect(
      executeIntegration(sb, {
        connection_id: "conn-test-1",
        action: "http.fetch",
        input: { url: "https://example.com" },
      }),
    ).rejects.toThrow("revoked");
  });

  it("throws on non-readonly action", async () => {
    const sb = makeSb();
    seedConnection(sb);

    await expect(
      executeIntegration(sb, {
        connection_id: "conn-test-1",
        action: "http.post_data",
        input: {},
      }),
    ).rejects.toThrow(RuntimeError);
  });

  it("traces execution when tracer provided", async () => {
    const sb = makeSb();
    seedConnection(sb);
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "tool_test",
      input: { test: true },
    });

    // http.fetch will fail (no real network in test) but the trace flow works
    try {
      await executeIntegration(sb, {
        connection_id: "conn-test-1",
        action: "http.fetch",
        input: { url: "https://example.com" },
        tracer,
      });
    } catch {
      // Expected: fetch may fail in test env
    }

    const events = tracer.getEvents();
    const traceEvents = events.filter(
      (e) => e.kind === "trace:completed" || e.kind === "trace:failed",
    );
    expect(traceEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects unknown provider adapter", async () => {
    const sb = makeSb();
    seedConnection(sb, { provider: "salesforce" });

    await expect(
      executeIntegration(sb, {
        connection_id: "conn-test-1",
        action: "salesforce.query",
        input: {},
      }),
    ).rejects.toThrow("No adapter registered");
  });
});

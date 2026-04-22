/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { RunStreamProvider, useRunStream } from "@/app/lib/run-stream-context";
import { useMomentum } from "@/app/hooks/use-momentum";

function useMomentumWithPush() {
  const momentum = useMomentum();
  const { push } = useRunStream();
  return { momentum, push };
}

function streamWrapper({ children }: { children: React.ReactNode }) {
  return <RunStreamProvider>{children}</RunStreamProvider>;
}

describe("useMomentum + RunStream (SSE bus)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const u =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        if (u.includes("/api/v2/right-panel")) {
          return Response.json({
            recentRuns: [],
            assets: [],
            missions: [],
          });
        }
        return Response.json({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates hasActive and lastStreamEventType after run_started (same path as useRightPanel SSE)", async () => {
    const { result } = renderHook(() => useMomentumWithPush(), { wrapper: streamWrapper });

    await waitFor(() => {
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });

    await act(async () => {
      result.current.push({
        type: "run_started",
        run_id: "run-momentum-hook",
        timestamp: 42_000,
      });
    });

    await waitFor(() => {
      expect(result.current.momentum.hasActive).toBe(true);
      expect(result.current.momentum.items.some((i) => i.kind === "run")).toBe(true);
      expect(result.current.momentum.lastStreamEventType).toBe("run_started");
      expect(result.current.momentum.lastStreamEventAt).toBe(42_000);
    });
  });
});

import { describe, it, expect } from "vitest";
import type { RightPanelData } from "@/lib/ui/right-panel/types";
import type { FocalObject } from "@/lib/right-panel/objects";
import { buildMomentumItems } from "@/app/lib/momentum-model";
import type { StreamEvent } from "@/app/lib/run-stream-context";

const EMPTY: RightPanelData = {
  recentRuns: [],
  assets: [],
  missions: [],
};

/**
 * Minimal replay of `use-right-panel` SSE merges — simulates the client-side
 * effect of the orchestration SSE bus before the next `/api/v2/right-panel` poll.
 */
function mergeRightPanelFromStreamEvent(
  prev: RightPanelData,
  event: StreamEvent,
): RightPanelData {
  switch (event.type) {
    case "run_started":
      return {
        ...prev,
        currentRun: {
          id: (event.run_id as string) ?? "unknown",
          status: "running",
        },
      };
    case "run_completed":
    case "run_failed":
      return { ...prev, currentRun: undefined };
    case "focal_object_ready":
      return {
        ...prev,
        focalObject: event.focal_object as Record<string, unknown>,
      };
    case "scheduled_mission_created":
      return {
        ...prev,
        missions: [
          {
            id: (event.mission_id as string) ?? "",
            name: (event.name as string) ?? "Mission",
            input: (event.input as string) ?? "",
            schedule: (event.schedule as string) ?? "",
            enabled: true,
            opsStatus: "idle",
          },
          ...prev.missions,
        ],
      };
    default:
      return prev;
  }
}

describe("buildMomentumItems", () => {
  it("returns empty when nothing active", () => {
    expect(buildMomentumItems(EMPTY, null)).toEqual([]);
  });

  it("includes a running currentRun", () => {
    const data: RightPanelData = {
      ...EMPTY,
      currentRun: { id: "run-1", status: "running" },
    };
    const items = buildMomentumItems(data, null);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("run");
    expect(items[0]!.status).toBe("running");
  });

  it("includes missions that are running or blocked", () => {
    const data: RightPanelData = {
      ...EMPTY,
      missions: [
        {
          id: "m1",
          name: "Veille",
          input: "x",
          schedule: "daily",
          enabled: true,
          opsStatus: "running",
        },
        {
          id: "m2",
          name: "Paused",
          input: "y",
          schedule: "daily",
          enabled: false,
          opsStatus: "idle",
        },
        {
          id: "m3",
          name: "Blocked job",
          input: "z",
          schedule: "hourly",
          enabled: true,
          opsStatus: "blocked",
        },
      ],
    };
    const items = buildMomentumItems(data, null);
    expect(items.map((i) => i.id).sort()).toEqual(["mission:m1", "mission:m3"].sort());
  });

  it("includes focal when status is in the active set", () => {
    const focal = {
      objectType: "report",
      id: "fo-1",
      threadId: "t1",
      title: "Q4 brief",
      status: "awaiting_approval",
      createdAt: 1,
      updatedAt: 1,
      morphTarget: null,
    } as FocalObject;
    expect(buildMomentumItems(EMPTY, focal)).toHaveLength(1);
    expect(buildMomentumItems(EMPTY, focal)[0]!.status).toBe("awaiting_approval");
  });

  it("excludes focal when ready or paused", () => {
    const ready = {
      objectType: "doc",
      id: "fo-2",
      threadId: "t1",
      title: "Doc",
      status: "ready",
      createdAt: 1,
      updatedAt: 1,
      morphTarget: null,
    } as FocalObject;
    expect(buildMomentumItems(EMPTY, ready)).toHaveLength(0);
  });
});

describe("SSE simulation → momentum", () => {
  it("shows run after run_started then clears after run_completed", () => {
    let data = EMPTY;
    data = mergeRightPanelFromStreamEvent(data, {
      type: "run_started",
      timestamp: 1000,
      run_id: "r-99",
    });
    expect(buildMomentumItems(data, null)).toHaveLength(1);

    data = mergeRightPanelFromStreamEvent(data, {
      type: "run_completed",
      timestamp: 2000,
      run_id: "r-99",
    });
    expect(buildMomentumItems(data, null)).toHaveLength(0);
  });

  it("shows focal after focal_object_ready with composing status", () => {
    let data = EMPTY;
    data = mergeRightPanelFromStreamEvent(data, {
      type: "focal_object_ready",
      timestamp: 1,
      focal_object: {
        objectType: "outline",
        id: "f1",
        threadId: "t1",
        title: "Plan",
        status: "composing",
        createdAt: 1,
        updatedAt: 1,
        morphTarget: "report",
      },
    });
    const focal = data.focalObject as unknown as FocalObject;
    const items = buildMomentumItems(data, focal);
    expect(items.some((i) => i.kind === "focal" && i.status === "composing")).toBe(true);
  });

  it("scheduled_mission_created does not surface until ops running (idle omitted)", () => {
    let data = EMPTY;
    data = mergeRightPanelFromStreamEvent(data, {
      type: "scheduled_mission_created",
      timestamp: 1,
      mission_id: "mid",
      name: "New mission",
      input: "do",
      schedule: "daily",
    });
    expect(buildMomentumItems(data, null)).toHaveLength(0);
  });
});

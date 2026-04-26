import { describe, expect, it, vi } from "vitest";
import { PlanStore } from "@/lib/engine/runtime/plans/store";
import { RunEngine } from "@/lib/engine/runtime/engine";

describe("runtime fixes", () => {
  it("resolves planner dependency indices to persisted step UUIDs", async () => {
    const planStepUpdates: Array<{ id: string; depends_on: string[] }> = [];

    const db = {
      from: (table: string) => {
        if (table === "plans") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: "plan-1" }, error: null }),
              }),
            }),
          };
        }

        if (table === "plan_steps") {
          return {
            insert: () => ({
              select: async () => ({
                data: [
                  { id: "step-a", order: 0 },
                  { id: "step-b", order: 1 },
                ],
                error: null,
              }),
            }),
            update: ({ depends_on }: { depends_on: string[] }) => ({
              eq: async (_field: string, id: string) => {
                planStepUpdates.push({ id, depends_on });
                return { error: null };
              },
            }),
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "step-a",
                      plan_id: "plan-1",
                      order: 0,
                      intent: "first",
                      agent: "KnowledgeRetriever",
                      task_description: "first task",
                      expected_output: "summary",
                      retrieval_mode: "messages",
                      depends_on: [],
                      optional: false,
                      status: "pending",
                      run_step_id: null,
                      completed_at: null,
                    },
                    {
                      id: "step-b",
                      plan_id: "plan-1",
                      order: 1,
                      intent: "second",
                      agent: "Analyst",
                      task_description: "second task",
                      expected_output: "report",
                      retrieval_mode: null,
                      depends_on: ["step-a"],
                      optional: false,
                      status: "pending",
                      run_step_id: null,
                      completed_at: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const store = new PlanStore(db as never);
    await store.createPlan("run-1", "reasoning", [
      {
        intent: "first",
        agent: "KnowledgeRetriever",
        task_description: "first task",
        expected_output: "summary",
        retrieval_mode: "messages",
        depends_on: [],
        optional: false,
      },
      {
        intent: "second",
        agent: "Analyst",
        task_description: "second task",
        expected_output: "report",
        depends_on: ["0"],
        optional: false,
      },
    ]);

    expect(planStepUpdates).toEqual([
      { id: "step-b", depends_on: ["step-a"] },
    ]);
  });

  it("still emits run_completed when artifact lookup fails", async () => {
    const transition = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();

    const fakeEngine = {
      transition,
      artifacts: {
        listRefs: vi.fn().mockRejectedValue(new Error("artifact lookup failed")),
      },
      events: { emit },
      runId: "run-123",
    };

    await (RunEngine.prototype.complete as unknown as (this: unknown) => Promise<void>).call(fakeEngine);

    expect(transition).toHaveBeenCalledWith("completed");
    expect(emit).toHaveBeenCalledWith({
      type: "run_completed",
      run_id: "run-123",
      artifacts: [],
    });
  });
});

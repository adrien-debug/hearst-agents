/**
 * Focal Resolution — Tests for canonical focal object resolution
 *
 * Verifies priority: 1. awaiting_approval plan → 2. executing plan →
 * 3. latest asset → 4. active mission → 5. null
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveFocalObject,
  manifestPlan,
  manifestAsset,
  manifestMission,
} from "@/lib/ui/right-panel/manifestation";
import type { ExecutionPlan, MissionDefinition } from "@/lib/planner/types";
import type { Asset } from "@/lib/assets/types";
import type { ProviderId } from "@/lib/providers/types";

describe("resolveFocalObject — Canonical Priority", () => {
  const mockThreadId = "test-thread-1";
  const mockTenantId = "test-tenant";
  const mockWorkspaceId = "test-workspace";
  const mockUserId = "test-user";

  const createMockPlan = (overrides: Partial<ExecutionPlan> = {}): ExecutionPlan => ({
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId: mockThreadId,
    tenantId: mockTenantId,
    workspaceId: mockWorkspaceId,
    userId: mockUserId,
    type: "one_shot",
    intent: "Test plan intent",
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [],
    ...overrides,
  });

  const createMockMission = (overrides: Partial<MissionDefinition> = {}): MissionDefinition => ({
    id: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId: mockThreadId,
    tenantId: mockTenantId,
    workspaceId: mockWorkspaceId,
    userId: mockUserId,
    naturalLanguageRule: "Test mission rule",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schedule: "0 9 * * *",
    sourcePlanId: undefined,
    ...overrides,
  });

  const createMockAsset = (overrides: Partial<Asset> = {}): Asset => ({
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId: mockThreadId,
    kind: "brief",
    title: "Test Asset",
    createdAt: Date.now(),
    provenance: {
      runId: "run-1",
      agentId: "agent-1",
      providerId: "openai" as ProviderId,
    },
    ...overrides,
  });

  it("should return null when no plans, missions, or assets exist", () => {
    const result = resolveFocalObject([], [], []);
    expect(result).toBeNull();
  });

  it("should return an active mission when no plans or assets", () => {
    const mission = createMockMission({ status: "active" });
    const result = resolveFocalObject([], [mission], []);
    expect(result).not.toBeNull();
    expect(result?.objectType).toBe("mission_active");
  });

  it("should return latest asset over active mission", () => {
    const mission = createMockMission({ status: "active" });
    const asset = createMockAsset({ kind: "report", title: "Latest Report" });
    const result = resolveFocalObject([], [mission], [asset]);
    expect(result).not.toBeNull();
    expect(result?.objectType).toBe("report");
    expect(result?.title).toBe("Latest Report");
  });

  it("should return executing plan over asset", () => {
    const asset = createMockAsset({ kind: "brief" });
    const plan = createMockPlan({
      status: "executing",
      steps: [
        {
          id: "step-1",
          kind: "generate_asset",
          title: "Generate report",
          status: "running",
          dependsOn: [],
          risk: "low",
        },
      ],
    });
    const result = resolveFocalObject([plan], [], [asset]);
    expect(result).not.toBeNull();
    expect(result?.objectType).toBe("outline"); // executing plan with generate_asset → outline
  });

  it("should return awaiting_approval plan over executing plan", () => {
    // Executing plan with generate_asset step → produces outline
    const executingPlan = createMockPlan({
      status: "executing",
      intent: "Generate report",
      steps: [
        {
          id: "step-1",
          kind: "generate_asset",
          title: "Generate report",
          status: "running",
          dependsOn: [],
          risk: "low",
        },
      ],
    });
    // Awaiting approval plan with deliver step → produces message_draft
    const awaitingPlan = createMockPlan({
      status: "awaiting_approval",
      intent: "Send message to John",
      steps: [
        {
          id: "step-1",
          kind: "deliver",
          title: "Send message",
          status: "ready", // not "done" so it creates a draft
          dependsOn: [],
          risk: "medium",
        },
      ],
    });
    // Put awaitingPlan second in array to test that resolveFocalObject still picks it
    const result = resolveFocalObject([executingPlan, awaitingPlan], [], []);
    expect(result).not.toBeNull();
    // Priority: awaiting_approval plan wins over executing plan
    expect(result?.objectType).toBe("message_draft");
    expect(result?.status).toBe("awaiting_approval");
  });

  it("should include sourcePlanId in manifested plan objects", () => {
    const plan = createMockPlan({
      status: "awaiting_approval",
      id: "plan-123",
      intent: "Send message",
      steps: [
        {
          id: "step-1",
          kind: "deliver",
          title: "Send",
          status: "pending", // not done → creates draft
          dependsOn: [],
          risk: "medium",
        },
      ],
    });
    const result = manifestPlan(plan);
    expect(result).not.toBeNull();
    expect(result?.sourcePlanId).toBe("plan-123");
  });

  it("should include sourceAssetId in manifested asset objects", () => {
    const asset = createMockAsset({ id: "asset-456", kind: "report" });
    const result = manifestAsset(asset);
    expect(result).not.toBeNull();
    expect(result?.sourceAssetId).toBe("asset-456");
    expect(result?.objectType).toBe("report");
  });

  it("should include primaryAction for awaiting_approval plans", () => {
    const plan = createMockPlan({
      status: "awaiting_approval",
      intent: "Send message",
      steps: [
        {
          id: "step-1",
          kind: "deliver",
          title: "Send",
          status: "pending", // not done → creates draft with primaryAction
          dependsOn: [],
          risk: "medium",
        },
      ],
    });
    const result = manifestPlan(plan);
    expect(result).not.toBeNull();
    expect(result?.primaryAction).toBeDefined();
    expect(result?.primaryAction?.kind).toBe("approve");
    expect(result?.primaryAction?.label).toBe("Envoyer");
  });

  it("should include morphTarget for draft objects", () => {
    const plan = createMockPlan({
      status: "awaiting_approval",
      type: "mission",
      intent: "Daily report",
      steps: [],
    });
    const result = manifestPlan(plan);
    expect(result).not.toBeNull();
    expect(result?.objectType).toBe("mission_draft");
    expect(result?.morphTarget).toBe("mission_active");
  });

  it("should handle mission with monitoring mode", () => {
    const mission = createMockMission({
      mode: "monitoring",
      status: "active",
      condition: "New leads",
    });
    const result = manifestMission(mission);
    expect(result.objectType).toBe("watcher_active");
    expect(result.condition).toBe("New leads");
  });

  it("should handle paused missions", () => {
    const mission = createMockMission({ status: "paused" });
    const result = manifestMission(mission);
    expect(result.status).toBe("paused");
    expect(result.primaryAction?.kind).toBe("resume");
    expect(result.primaryAction?.label).toBe("Reprendre");
  });
});

describe("manifestAsset — Asset Type Mapping", () => {
  const baseAsset: Asset = {
    id: "asset-1",
    threadId: "thread-1",
    kind: "brief",
    title: "Test",
    createdAt: Date.now(),
    provenance: {
      runId: "run-1",
      agentId: "agent-1",
      providerId: "openai" as ProviderId,
    },
  };

  it("should manifest brief asset correctly", () => {
    const result = manifestAsset({ ...baseAsset, kind: "brief" });
    expect(result?.objectType).toBe("brief");
    expect(result?.tier).toBe("brief");
  });

  it("should manifest report asset correctly", () => {
    const result = manifestAsset({ ...baseAsset, kind: "report" });
    expect(result?.objectType).toBe("report");
    expect(result?.tier).toBe("report");
  });

  it("should manifest message asset as receipt", () => {
    const result = manifestAsset({
      ...baseAsset,
      kind: "message",
      title: "Message à John",
      provenance: {
        ...baseAsset.provenance,
        deliveryStatus: "sent",
        sentAt: Date.now(),
      },
    });
    expect(result?.objectType).toBe("message_receipt");
    expect((result as { recipient?: string }).recipient).toBe("John");
  });

  it("should include wordCount when available", () => {
    const result = manifestAsset(
      { ...baseAsset, kind: "report" },
      { wordCount: 1500, title: "Test", summary: "Test summary", sections: [] }
    );
    expect(result?.wordCount).toBe(1500);
  });
});

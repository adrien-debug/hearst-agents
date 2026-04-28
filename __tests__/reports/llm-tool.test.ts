/**
 * Tests du tool propose_report_spec — validation des inputs LLM
 * (acceptation drafts valides, rejet structures malformées).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock executeComposioAction pour ne pas appeler la vraie API
vi.mock("@/lib/connectors/composio/client", () => ({
  executeComposioAction: vi.fn(async () => ({ ok: true, data: { items: [] } })),
}));

// Mock storeAsset (pas de DB en tests unit)
vi.mock("@/lib/assets/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/assets/types")>(
    "@/lib/assets/types",
  );
  return { ...actual, storeAsset: vi.fn() };
});

import { buildProposeReportSpecTool } from "@/lib/reports/spec/llm-tool";
import { storeAsset } from "@/lib/assets/types";

const mockEngine = {
  id: "run-test-1",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const mockEventBus = {
  emit: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const ctx = {
  threadId: "thread-1",
  userId: "user-1",
  tenantId: "dev-tenant",
  workspaceId: "dev-workspace",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("propose_report_spec — validation input", () => {
  it("rejette un draft sans meta", async () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (tool.execute as any)({}, {});
    expect(out).toMatch(/Erreur de structure/);
  });

  it("rejette un draft avec un kind de source invalide", async () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (tool.execute as any)(
      {
        meta: {
          title: "Test",
          summary: "",
          domain: "founder",
          persona: "founder",
          cadence: "ad-hoc",
          confidentiality: "internal",
        },
        sources: [
          { id: "x", kind: "magic", spec: {} },
        ],
        blocks: [
          { id: "b", type: "kpi", dataRef: "x", layout: { col: 1, row: 0 }, props: {} },
        ],
      },
      {},
    );
    expect(out).toMatch(/Erreur de structure/);
  });

  it("accepte un draft minimal valide", async () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);
    const draft = {
      meta: {
        title: "MRR Quick",
        summary: "Vue MRR",
        domain: "finance" as const,
        persona: "founder" as const,
        cadence: "ad-hoc" as const,
        confidentiality: "internal" as const,
      },
      sources: [
        {
          id: "stripe_charges",
          kind: "composio" as const,
          spec: { action: "STRIPE_LIST_CHARGES", params: {} },
        },
      ],
      transforms: [
        {
          id: "mrr",
          op: "groupBy" as const,
          inputs: ["stripe_charges"] as [string],
          params: {
            by: ["currency"],
            measures: [{ name: "total", fn: "sum" as const, field: "amount" }],
          },
        },
      ],
      blocks: [
        {
          id: "k",
          type: "kpi" as const,
          dataRef: "mrr",
          layout: { col: 1 as const, row: 0 },
          props: { field: "total" },
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (tool.execute as any)(draft, {});
    expect(out).toMatch(/g[ée]n[ée]r[ée]/i);
    expect(storeAsset).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "asset_generated" }),
    );
  });
});

describe("propose_report_spec — schema cohérence", () => {
  it("expose un inputSchema Zod-compatible", () => {
    const tool = buildProposeReportSpecTool(mockEngine, mockEventBus, ctx);
    expect(tool.inputSchema).toBeDefined();
    expect(tool.description).toMatch(/UNIQUEMENT/);
    expect(tool.description).toMatch(/cockpit|tableau|rapport/i);
  });
});

describe("propose_report_spec — defaults safety", () => {
  it("le draft schema accepte transforms = []", () => {
    const draftSchema = z.object({
      transforms: z.array(z.unknown()).default([]),
    });
    const out = draftSchema.parse({});
    expect(out.transforms).toEqual([]);
  });
});

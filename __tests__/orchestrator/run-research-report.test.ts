/**
 * runResearchReport — shape + SSE contract.
 *
 * Verrouille le contrat de persistance V2 du research path :
 *   - Asset persisté via `storeAsset` (lib/assets/types.ts), pas via le
 *     runtime store in-memory only.
 *   - `kind: "report"`, `provenance.specId: "research"`, `runArtifact: true`,
 *     `provenance.pdfFile` quand le PDF est généré.
 *   - `contentRef` est du JSON parsable avec `narration` markdown.
 *   - Events SSE émis dans le bon ordre (step_started → step_completed →
 *     text_delta → asset_generated → focal_object_ready).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks hoistés (partagés entre vi.mock factories et les tests) ─────

const mocks = vi.hoisted(() => ({
  storeAssetMock: vi.fn(),
  searchWebMock: vi.fn(),
  generatePdfMock: vi.fn(),
  anthropicCreateMock: vi.fn(),
}));

vi.mock("@/lib/assets/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/assets/types")>("@/lib/assets/types");
  return { ...actual, storeAsset: mocks.storeAssetMock };
});

vi.mock("@/lib/tools/handlers/web-search", () => ({
  searchWeb: (q: string) => mocks.searchWebMock(q),
}));

vi.mock("@/lib/engine/runtime/assets/generators/pdf", () => ({
  generatePdfArtifact: (input: Record<string, unknown>) => mocks.generatePdfMock(input),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: (input: unknown) => mocks.anthropicCreateMock(input),
      };
    },
  };
});

// ── Imports après mocks ─────────────────────────────────────
import { runResearchReport } from "@/lib/engine/orchestrator/run-research-report";
import type { RunEventBus } from "@/lib/events/bus";
import type { RunEngine } from "@/lib/engine/runtime/engine";

interface CapturedEvent {
  type: string;
  [key: string]: unknown;
}

function makeEventBus(): { bus: RunEventBus; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  const bus = {
    emit: (event: CapturedEvent) => {
      events.push(event);
    },
  } as unknown as RunEventBus;
  return { bus, events };
}

function makeEngine(id = "run-test-1"): {
  engine: RunEngine;
  completed: { value: boolean };
  failed: { reason?: string };
} {
  const completed = { value: false };
  const failed: { reason?: string } = {};
  const engine = {
    id,
    complete: vi.fn().mockImplementation(async () => {
      completed.value = true;
    }),
    fail: vi.fn().mockImplementation(async (reason: string) => {
      failed.reason = reason;
    }),
  } as unknown as RunEngine;
  return { engine, completed, failed };
}

beforeEach(() => {
  mocks.storeAssetMock.mockReset();
  mocks.searchWebMock.mockReset();
  mocks.generatePdfMock.mockReset();
  mocks.anthropicCreateMock.mockReset().mockResolvedValue({
    content: [{ type: "text", text: "## Synthèse\n\nContenu rédigé par le mock." }],
  });
  process.env.ANTHROPIC_API_KEY = "sk-test-key";
});

describe("runResearchReport — shape de l'asset persisté", () => {
  it("persiste un Asset V2 avec kind=report et provenance research", async () => {
    mocks.searchWebMock.mockResolvedValue({
      results: [
        { title: "Source 1", url: "https://example.com/1", snippet: "..." },
      ],
      summary: "Petit résumé < 200 chars",
    });
    mocks.generatePdfMock.mockResolvedValue({
      storageKind: "file",
      fileName: "test.pdf",
      mimeType: "application/pdf",
      filePath: "/tmp/test.pdf",
      sizeBytes: 12345,
    });

    const { bus } = makeEventBus();
    const { engine, completed } = makeEngine();

    await runResearchReport({
      message: "fais-moi un rapport sur la blockchain",
      engine,
      eventBus: bus,
      scope: {
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        userId: "user-1",
      },
      threadId: "thread-1",
    });

    expect(completed.value).toBe(true);
    expect(mocks.storeAssetMock).toHaveBeenCalledTimes(1);

    const asset = mocks.storeAssetMock.mock.calls[0][0];
    expect(asset.kind).toBe("report");
    expect(asset.threadId).toBe("thread-1");
    expect(asset.title).toMatch(/Report/i);
    expect(asset.runId).toBe(engine.id);
    expect(asset.provenance.providerId).toBe("system");
    expect(asset.provenance.tenantId).toBe("tenant-1");
    expect(asset.provenance.workspaceId).toBe("ws-1");
    expect(asset.provenance.specId).toBe("research");
    expect(asset.provenance.runArtifact).toBe(true);
    expect(asset.provenance.pdfFile).toMatchObject({
      fileName: "test.pdf",
      mimeType: "application/pdf",
      filePath: "/tmp/test.pdf",
    });
  });

  it("contentRef est du JSON parsable avec narration markdown", async () => {
    mocks.searchWebMock.mockResolvedValue({
      results: [{ title: "S", url: "https://e.co", snippet: "x" }],
      summary: "x",
    });
    mocks.generatePdfMock.mockResolvedValue(null);

    const { bus } = makeEventBus();
    const { engine } = makeEngine();

    await runResearchReport({
      message: "rapport sur les LLMs",
      engine,
      eventBus: bus,
      scope: { tenantId: "t", workspaceId: "w", userId: "u" },
      threadId: "th",
    });

    const asset = mocks.storeAssetMock.mock.calls[0][0];
    expect(asset.contentRef).toBeTypeOf("string");

    const parsed = JSON.parse(asset.contentRef!) as {
      payload: { blocks: unknown[]; generatedAt: number };
      narration: string;
      research: { query: string; sourcesCount: number; sources: Array<{ title: string; url: string }> };
    };
    expect(parsed.payload.blocks).toEqual([]);
    expect(parsed.narration).toContain("Synthèse");
    expect(parsed.research.query).toBeTypeOf("string");
    expect(parsed.research.sourcesCount).toBe(1);
    expect(parsed.research.sources[0].url).toBe("https://e.co");
  });

  it("ne persiste pas l'asset si la requête est trop courte et n'est pas un report intent", async () => {
    mocks.searchWebMock.mockResolvedValue({
      results: [{ title: "S", url: "https://e.co", snippet: "x" }],
      summary: "court",
    });

    const { bus } = makeEventBus();
    const { engine } = makeEngine();

    // Pas un report intent + reportText court (< 500 chars) → skip persistance
    await runResearchReport({
      message: "cherche blockchain",
      engine,
      eventBus: bus,
      scope: { tenantId: "t", workspaceId: "w", userId: "u" },
    });

    // L'Anthropic mock retourne ~50 chars, et "cherche" n'est pas un report intent
    expect(mocks.storeAssetMock).not.toHaveBeenCalled();
  });
});

describe("runResearchReport — contrat SSE", () => {
  it("émet la séquence step_started → step_completed → text_delta → asset_generated → focal_object_ready", async () => {
    mocks.searchWebMock.mockResolvedValue({
      results: [{ title: "S", url: "https://e.co", snippet: "x" }],
      summary: "x",
    });
    mocks.generatePdfMock.mockResolvedValue({
      storageKind: "file",
      fileName: "out.pdf",
      mimeType: "application/pdf",
      filePath: "/tmp/out.pdf",
      sizeBytes: 1,
    });

    const { bus, events } = makeEventBus();
    const { engine } = makeEngine();

    await runResearchReport({
      message: "fais-moi un rapport sur X",
      engine,
      eventBus: bus,
      scope: { tenantId: "t", workspaceId: "w", userId: "u" },
      threadId: "th",
    });

    const types = events.map((e) => e.type);
    // Les premières events arrivent dans cet ordre.
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");
    expect(types).toContain("text_delta");
    expect(types).toContain("asset_generated");
    expect(types).toContain("focal_object_ready");

    // step_started arrive avant step_completed (web search)
    expect(types.indexOf("step_started")).toBeLessThan(types.indexOf("step_completed"));
    // text_delta arrive avant asset_generated
    expect(types.indexOf("text_delta")).toBeLessThan(types.indexOf("asset_generated"));
    // focal_object_ready arrive après asset_generated
    expect(types.indexOf("asset_generated")).toBeLessThan(types.indexOf("focal_object_ready"));
  });

  it("émet step_failed + fail engine si la web search échoue", async () => {
    mocks.searchWebMock.mockRejectedValue(new Error("network down"));

    const { bus, events } = makeEventBus();
    const { engine, failed } = makeEngine();

    await runResearchReport({
      message: "rapport sur Y",
      engine,
      eventBus: bus,
      scope: { tenantId: "t", workspaceId: "w", userId: "u" },
    });

    expect(failed.reason).toMatch(/network down/);
    expect(events.find((e) => e.type === "step_failed")).toBeDefined();
    // L'asset n'est pas persisté quand la search échoue
    expect(mocks.storeAssetMock).not.toHaveBeenCalled();
  });

  it("asset_generated event porte les infos PDF quand le PDF est généré", async () => {
    mocks.searchWebMock.mockResolvedValue({
      results: [{ title: "S", url: "https://e.co", snippet: "x" }],
      summary: "x",
    });
    mocks.generatePdfMock.mockResolvedValue({
      storageKind: "file",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      filePath: "/tmp/report.pdf",
      sizeBytes: 9999,
    });

    const { bus, events } = makeEventBus();
    const { engine } = makeEngine();

    await runResearchReport({
      message: "fais-moi un rapport sur Z",
      engine,
      eventBus: bus,
      scope: { tenantId: "t", workspaceId: "w", userId: "u" },
    });

    const assetEvent = events.find((e) => e.type === "asset_generated");
    expect(assetEvent).toBeDefined();
    expect(assetEvent).toMatchObject({
      asset_type: "report",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      filePath: "/tmp/report.pdf",
      sizeBytes: 9999,
    });
  });
});
